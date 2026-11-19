# OneGo Architecture

## Design principles

1. **The platform owns state.** Conversations, task progress, file changes, and
   project memory live in OneGo. Providers are stateless workers that receive a
   context package and return results.
2. **Adapters expose only what is real.** Each provider integration is limited to
   its official API/OAuth/CLI surface. Unsupported capabilities are declared as
   absent and surfaced in the UI — never mocked. See
   [provider-integrations.md](./provider-integrations.md).
3. **No fabricated usage data.** Quota, tokens, and cost are shown only when a
   provider reports them through an official channel; otherwise the UI displays
   "Usage information unavailable through provider integration."
4. **Switches are safe by construction.** Hard quota exhaustion is never retried,
   retry-after is respected, and tool executions carry idempotency keys so a
   provider switch cannot cause duplicate side effects.
5. **Core logic is frontend-independent.** Orchestration, routing, fallback, and
   context building live in `packages/core` / backend modules. The web app and
   future desktop/IDE clients consume the same HTTP/SSE contract.

## Runtime topology

```
Browser (React + Vite)
   │  REST + SSE (/api)
   ▼
API server (Express, TypeScript)
   │
   ├── Orchestration engine ──▶ Provider adapters ──▶ OpenAI HTTP
   │        │                        ├────────────▶ Anthropic HTTP
   │        │                        ├────────────▶ GitHub Models HTTP
   │        │                        └────────────▶ Qoder CLI (subprocess)
   │        ├── Fallback engine (error classification, retry policy)
   │        │   (GitHub adapter uses the official Copilot SDK in-process; Qoder uses its CLI)
   │        ├── Model router (manual / automatic / intelligent)
   │        └── Context engine (event log + versioned snapshots)
   │
   ├── PostgreSQL (Prisma): platform state, memory, usage, audit
   └── Redis: rate limits, queues, distributed locks (Phase 5+)
```

## Repository layout

```
onego/
├── apps/
│   ├── server/          Express API, Prisma schema, orchestration wiring
│   │   ├── prisma/schema.prisma
│   │   └── src/{app.ts,index.ts,config,lib,routes}
│   └── web/             React + Vite + Tailwind workspace shell
├── packages/
│   ├── shared/          Provider-agnostic domain types (messages, usage, routing)
│   └── core/            Adapter contract, registry, error taxonomy + tests
├── docs/                Architecture and provider integration research
├── docker-compose.yml   PostgreSQL 16 + Redis 7 for local development
└── DEVELOPMENT_PROGRESS.md
```

## Module map (brief → implementation)

| Brief system | Location (planned) | Phase |
| --- | --- | --- |
| Provider management | `apps/server/src/modules/providers`, `packages/core/src/providers` | 3–4 |
| AI orchestration | `apps/server/src/modules/orchestration` | 5 |
| Automatic fallback | `apps/server/src/modules/fallback`, `packages/core` error taxonomy | 6 |
| Intelligent router | `apps/server/src/modules/routing` | 10 |
| Conversation continuity | `apps/server/src/modules/conversations`, `context` | 7 |
| Project memory / indexing | `apps/server/src/modules/projects`, `repository` | 8 |
| Unified workspace | `apps/web` | 2, 5, 9 |
| Tool execution | `apps/server/src/modules/tools` | 9 |
| Usage analytics | `apps/server/src/modules/usage`, `analytics` | 10 |
| Security | cross-cutting: auth module, crypto, audit, approvals | 11 |

## Request lifecycle

1. Client sends a prompt with `conversationId` (or creates one).
2. Orchestrator loads conversation, project memory, and recent snapshots.
3. Task classifier tags the request (`architecture`, `debugging`, …).
4. Router selects account + model according to the conversation's routing mode.
5. Context builder assembles a token-budgeted package for that model.
6. Adapter sends the provider-specific request; response streams over SSE.
7. Text deltas, tool calls, usage, and errors are recorded as conversation
   events; tool executions are written with idempotency keys.
8. On success: snapshot update, usage event, task state update.
9. On failure: the error taxonomy classifies it (see below) and the fallback
   engine decides retry, cooldown, or switch.

## Error handling and fallback

`packages/core/src/errors/provider-error.ts` classifies failures into:
`auth`, `permission`, `quota_exhausted`, `rate_limited`, `timeout`, `network`,
`invalid_request`, `content_policy`, `server`, `unknown`.

Policy:

| Kind | Retry same provider | Next action |
| --- | --- | --- |
| `quota_exhausted` | Never | Mark account unavailable until reported reset; switch provider |
| `rate_limited` | After `retry-after` | Cool down, then switch if still limited |
| `auth` / `permission` | Never | Surface re-authorization requirement; do not silently switch |
| `timeout` / `network` / `server` | Bounded retries | Switch after retry budget |
| `invalid_request` / `content_policy` | Never | Return error to user |

Provider switching follows the PREPARE → ANALYZE → TRANSFER → RESUME → VERIFY
protocol. Every switch writes a `ProviderSwitch` row and emits a conversation
event, and the user receives an explicit notification.

## Context continuity

- `ConversationEvent` is the append-only source of truth (messages, tool calls,
  file changes, decisions, errors, switches).
- `ContextSnapshot` stores versioned, structured packages — not only AI-generated
  summaries — so state can be reconstructed deterministically.
- The context builder (Phase 7) budgets tokens per destination model: original
  requirements, recent turns, relevant files via repository retrieval, decisions,
  completed/pending work, known errors, and project memory.
- `Conversation.version` provides optimistic concurrency; stale writes are
  rejected instead of overwriting another provider's work.
- `FileChangeLog` records hashes and diffs per change; destructive operations
  require explicit approval (Phase 9/11).

## Security model

- Provider credentials are encrypted server-side with AES-256-GCM using a
  versioned key (`CREDENTIAL_ENCRYPTION_KEY`, 32 bytes base64). Only ciphertext
  is stored (`ProviderAccount.credentialCiphertext`); plaintext exists only in
  memory for the duration of an adapter call.
- All provider calls happen server-side; the browser never receives credentials.
- Structured logging redacts authorization headers, tokens, and credential fields.
- `AuditLog` records sensitive actions (credential changes, destructive
  approvals, role changes).
- Rate limiting on auth and provider endpoints; request validation with zod.
- Terminal/tool execution is allowlisted and gated by user approval (Phase 9).

## Technical decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Backend framework | Express + modular folders | Smaller surface than NestJS; modules stay isolated by convention and interfaces |
| Streaming | Server-Sent Events | One-way token stream fits chat; WebSocket reserved for terminal in Phase 9 |
| Monorepo | npm workspaces | Zero extra tooling; packages are consumed as TS sources and bundled at build time |
| ORM / DB | Prisma + PostgreSQL | Typed schema, migrations, strong relational model for continuity data |
| Credential crypto | AES-256-GCM with key version | Authenticated encryption; supports rotation |
| Web stack | React + Vite + Tailwind v4 | Fast iteration; shadcn/ui and Monaco added in Phases 2/9 |
| Build | tsup (server) + Vite (web) | Bundles workspace TS packages without project-reference overhead |

## Deferred decisions

- Copilot SDK session configuration (BYOK vs user/org auth) — validate against
  the GA SDK before Phase 4 (see provider doc). GitHub Models is retired and is
  not a candidate.
- Semantic index backend (pgvector vs external) — decided in Phase 8.
- Desktop/VS Code packaging — Phase 12.
