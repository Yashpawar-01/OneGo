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
   retry-after is respected, and tool execution rows carry idempotency columns
   (execution itself is not implemented yet).
5. **Core logic is frontend-independent.** Orchestration, routing, fallback,
   context building, and the OpenAI/Anthropic/Simulated adapters live in
   `packages/core`; SDK/CLI-backed adapters live in the server. The web client
   consumes the same HTTP/SSE contract a future desktop/IDE client would.

## Runtime topology

```
Browser (React + Vite)
   │  REST + SSE (/api)
   ▼
API server (Express, TypeScript)
   │
   ├── Orchestration engine ──▶ Provider adapters ──▶ OpenAI HTTP (Chat Completions)
   │        │                        ├────────────▶ Anthropic HTTP (Messages API)
   │        │                        ├────────────▶ GitHub Copilot SDK (in-process)
   │        │                        └────────────▶ Qoder CLI (subprocess)
   │        ├── Fallback engine (error classification, retry policy, cooldowns)
   │        ├── Model router (manual / automatic / intelligent classification)
   │        └── Context engine (message history, memory, task state, snapshots)
   │
   └── PostgreSQL (Prisma): platform state, memory, usage, audit
       Redis: optional; not required for single-node operation today
```

## Repository layout

```
onego/
├── apps/
│   ├── server/          Express API, Prisma schema, services, adapters, routes
│   │   ├── prisma/schema.prisma
│   │   └── src/{app.ts,index.ts,config,lib,routes,services,adapters,providers}
│   └── web/             React + Vite + Tailwind workspace UI
│       ├── src/{components,pages,context,lib}
├── packages/
│   ├── shared/          Provider-agnostic domain types (messages, usage, routing)
│   └── core/            Adapter contract, OpenAI/Anthropic/Simulated adapters,
│                        registry, error taxonomy, fallback runner, context
│                        builder, task classifier + tests
├── docs/                Architecture and provider integration research
├── docker-compose.yml   PostgreSQL 16 + Redis 7 for local development
└── DEVELOPMENT_PROGRESS.md
```

## Module map (brief → implementation)

| Brief system | Location | State |
| --- | --- | --- |
| Provider management | `apps/server/src/routes/providers.ts`, `services/accounts.ts`, `providers/catalog.ts` | Implemented |
| Provider adapters | `packages/core/src/adapters/*`, `apps/server/src/adapters/copilot.ts`, `qoder-cli.ts` | Implemented |
| AI orchestration | `packages/core/src/orchestration`, `apps/server/src/services/chat.ts` | Implemented |
| Automatic fallback | `packages/core` error taxonomy + `FallbackRunner`, `services/cooldowns.ts` | Implemented |
| Intelligent router | `packages/core/src/routing`, `routes/usage.ts` preview, `routes/routing.ts` rules | Implemented (rule application deferred) |
| Conversation continuity | `services/context.ts` (context builder), `services/messages.ts`, `routes/conversations.ts` | Implemented |
| Project memory | `routes/projects.ts` (memories + tasks) | Implemented |
| Repository indexing | — | Not implemented |
| Unified workspace | `apps/web/src/pages/Workspace.tsx`, `lib/api.ts` SSE client | Chat workspace implemented; editor/terminal deferred |
| Tool execution | `packages/shared` tool types, schema | Schema only; execution deferred |
| Usage analytics | `routes/usage.ts`, `routes/overview.ts` | Implemented from recorded events |
| Security | `lib/crypto.ts`, `middleware/auth.ts`, `services/credentials.ts`, auth throttling | Implemented |

## Request lifecycle

1. Browser creates a conversation (`MANUAL` by default) and posts a prompt to
   `POST /api/conversations/:id/messages`, which opens an SSE stream.
2. `runChatTurn` validates ownership, appends the USER message (retrying
   sequence conflicts), and records a conversation event.
3. It loads the last 200 messages plus project memories, open tasks, and
   file-change summaries, then builds a context package inside a token budget.
4. `resolveTargets` orders enabled accounts by routing mode (manual selection
   first, priority in automatic mode, classifier-ranked model in intelligent
   mode), skips cooling-down accounts, and skips accounts with unusable
   credentials.
5. `FallbackRunner` invokes the adapter per target. Quota errors are never
   retried; rate-limited targets are retried only when `retry-after` fits the
   budget; partial output prevents further attempts.
6. Each attempt emits `attempt_started`, `delta`, `usage`; switches emit
   `fallback` and are persisted as `ProviderSwitch` rows with reason and labels.
7. On success the assistant message, usage event, daily rollup, context
   snapshot, and completion event are written; the conversation's active account
   and version are updated.
8. On failure the error (and any partial text when preserved) is persisted and
   returned as an SSE `error` event.

### Cooldowns

In-memory map keyed by account id: quota exhaustion 6 h, rate limit at least
2 min (honouring `retry-after`), auth failures 10 min. Credentials re-entry
clears the cooldown. Cooldown state is exposed per account in the overview.

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

- `ConversationEvent` is the append-only source of truth (user/assistant
  messages, provider errors, provider switches).
- `ContextSnapshot` stores a versioned package per turn (message window, token
  estimate, project memory/task/file-change inputs, trigger reason) so state can
  be audited and reconstructed.
- `buildContextPackage` (`packages/core`) budgets tokens per destination model:
  original requirements, pinned project memories, task state, file changes, and a
  recent message window; older messages are omitted explicitly and reported in
  the stream metadata.
- The same history is re-sent to whichever provider answers next — nothing is
  translated into provider-specific session state.
- `Conversation.version` increments on provider switches; `activeAccountId`
  tracks where the conversation currently lives.
- `FileChangeLog` persists change metadata for context; repository indexing and
  approval-gated edits are not implemented yet.

## Security model

- Provider credentials are encrypted server-side with AES-256-GCM using a
  versioned key (`CREDENTIAL_ENCRYPTION_KEY`, 32 bytes base64). Only ciphertext
  is stored (`ProviderAccount.credentialCiphertext`); plaintext exists only in
  memory for the duration of an adapter call. Metadata stores a last-4 hint.
- No API response serializes credential ciphertext or plaintext; account DTOs
  expose only a hint.
- All provider calls happen server-side; the browser never receives credentials.
- Structured logging redacts authorization headers, tokens, and credential
  fields; production errors hide internal details.
- Passwords use scrypt; sessions use HS256 JWTs with a 7-day expiry; login
  attempts are throttled (10 failures per 15 minutes per IP + email).
- Every provider, conversation, project, usage, and routing route is scoped to
  the authenticated user.
- Terminal/tool execution with approval gating is not part of this build.

## Technical decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Backend framework | Express + modular folders | Smaller surface than NestJS; modules stay isolated by convention and interfaces |
| Streaming | Server-Sent Events | One-way token stream fits chat; WebSocket reserved for terminal in Phase 9 |
| Monorepo | npm workspaces | Zero extra tooling; packages are consumed as TS sources and bundled at build time |
| ORM / DB | Prisma + PostgreSQL | Typed schema, migrations, strong relational model for continuity data |
| Credential crypto | AES-256-GCM with key version | Authenticated encryption; supports rotation |
| Web stack | React + Vite + Tailwind v4 | Fast iteration; a small local UI kit (`components/ui.tsx`) instead of pulling in a component framework |
| Build | tsup (server) + Vite (web) | Bundles workspace TS packages without project-reference overhead |

## Deferred decisions

- Applying routing rules inline in the orchestrator (today the conversation's
  routing mode selects the target).
- Semantic index backend for repository retrieval (pgvector candidate) and
  approval-gated file edits.
- Redis-backed distributed cooldowns and login throttling for multi-node
  deployment.
- Desktop/VS Code packaging over the same HTTP/SSE contract.
- Monaco editor and terminal integration.
