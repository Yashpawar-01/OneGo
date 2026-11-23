# Development progress

Tracking implementation against the phased plan. Updated at the end of every
phase, together with test results and any deviations.

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture, repository setup, schema, adapter contracts | ✅ Complete |
| 2 | UI shell and dashboard | ✅ Complete |
| 3 | Authentication and provider management | ✅ Complete |
| 4 | Provider adapters (OpenAI, Anthropic, GitHub, Qoder) | ✅ Complete |
| 5 | Unified chat + streaming | ✅ Complete |
| 6 | Automatic fallback engine | ✅ Complete |
| 7 | Cross-provider conversation continuity | ✅ Complete |
| 8 | Project memory and repository indexing | 🟡 Partial — memory done, indexing deferred |
| 9 | Unified coding workspace (editor, terminal, tools) | 🟡 Partial — chat workspace done, editor/terminal/tools deferred |
| 10 | Usage analytics and intelligent routing | ✅ Complete (routing-rule application deferred) |
| 11 | Security hardening, testing, optimization | ✅ Complete |
| 12 | Desktop and IDE integrations | ⏳ Not started |

## Phase 1 — completed 2026-11-19

### Delivered

- npm-workspaces monorepo: `apps/server`, `apps/web`, `packages/shared`, `packages/core`
- Strict TypeScript base config with shared path aliases; tsup for the server, Vite for the web
- PostgreSQL + Prisma schema covering every entity from the brief, plus three additions:
  - `ConversationEvent` — append-only log for event-based state reconstruction
  - `UsageEvent` — per-request usage rows for historical analytics
  - `AuditLog` — security-relevant actions
- Credential storage designed as AES-256-GCM ciphertext with key versioning;
  no plaintext credential columns exist in the schema
- Provider-agnostic adapter contract with optional operations
  (`getUsage`, `streamResponse`) and explicit capability flags
- Adapter registry with priority ordering and enable/disable support
- Error taxonomy with quota-vs-rate-limit separation, retry-after parsing, and tests
- Express server: zod-validated env, pino redaction, CORS allowlist, structured
  404/500 handling, `/api/health`, graceful shutdown
- Docker Compose for Postgres + Redis
- Architecture and provider-integration research docs

## Phase 2 — dashboard UI — completed 2026-11-23

- Dark-first design system in `apps/web/src/components/ui.tsx` (cards, buttons,
  badges, fields, stats, formatters), responsive AppShell with grouped sidebar
  and mobile navigation, live provider-connected indicator.
- Overview page wired to `/api/overview`: account status, 7-day usage, routing
  switches, onboarding checklist, recent conversations and fallback history.
  Empty states only — no seeded statistics.

## Phase 3 — authentication and provider management — completed 2026-11-23

- Register/login with scrypt password hashing and HS256 JWTs (7-day expiry);
  first registered user becomes OWNER. Login throttling (10 failures / 15 min).
- Provider catalog seeded from official definitions: OpenAI, Anthropic, GitHub
  Copilot, Qoder (auth methods, docs URLs, capability flags).
- Account CRUD: encrypted credentials (AES-256-GCM, key version), last-4 hint
  only in metadata, immediate validation, model sync, enable/disable, priority,
  default model. Credentials never returned by any API response.
- Providers UI: account forms per provider, validation feedback, model sync,
  usage probe, edit/delete with confirmation.

## Phase 4 — provider adapters — completed 2026-11-23

- OpenAI adapter (HTTP Chat Completions, SSE streaming, usage from response).
- Anthropic adapter (Messages API, SSE streaming, rate-limit header parsing,
  quota-vs-rate-limit classification).
- GitHub Copilot adapter (`@github/copilot-sdk` sessions, pooled clients with
  idle shutdown, permission requests denied by default, streaming deltas).
- Qoder adapter (official CLI headless mode, text streaming, JSON parsing for
  non-streaming, token from environment only, no `--yolo`).
- Registry priority: OpenAI 10, Anthropic 20, Copilot 30, Qoder 40.

## Phase 5 — unified chat and streaming — completed 2026-11-23

- `POST /api/conversations/:id/messages` streams named SSE events:
  `user_message`, `meta`, `attempt_started`, `delta`, `usage`, `fallback`,
  `done`, `error`. Heartbeats and abort-on-close are handled by the SSE writer.
- Server persists user and assistant messages, sequence allocation with retry,
  usage events, provider switches, context snapshots, conversation events.
- Workspace UI: conversation sidebar, routing/account/model/project selectors,
  live streaming bubbles, attempt/fallback/context telemetry, stop button.

## Phase 6 — automatic fallback — completed 2026-11-23

- FallbackRunner in `packages/core` classifies provider errors and switches
  accounts in priority order. Quota exhaustion is never retried; rate limits are
  retried only within the retry-after budget; partial output stops the run.
- Server marks cooldowns (quota 6 h, rate limit ≥ 2 min, auth 10 min), persists
  every switch with reason and provider labels, and sets account status on auth
  failures.
- Acceptance test simulates Anthropic `quota_exhausted` → OpenAI success over
  real SSE and asserts the preserved context, persisted switch, usage events,
  and multi-turn continuity.

## Phase 7 — conversation continuity — completed 2026-11-23

- Context builder resends the same conversation history to the destination
  model; attachments/system prompts are provider-agnostic.
- Versioned `ContextSnapshot` per turn (user-message and provider-switch
  triggers), `Conversation.version` bumped on switch, active account tracked.
- Continuation test: second turn requested with the original account still
  reaches the fallback provider and appends to the same conversation.

## Phase 8 — project memory — partially completed 2026-11-23

- Projects CRUD; project-scoped memories (key/value/category/pinned, versioned)
  and task state (pending / in progress / blocked / completed / cancelled).
- Pinned memories, open tasks, and file-change summaries are injected into the
  context package for every turn, regardless of provider.
- **Deferred:** repository indexing/retrieval, embeddings, and file-change
  capture. The Projects UI labels linked repositories as not indexed.

## Phase 9 — workspace — partially completed 2026-11-23

- Unified chat workspace, SSE streaming, fallback visibility, abort, context
  telemetry, conversation management (rename/archive/delete/filter).
- **Deferred:** Monaco editor, terminal, tool execution, and approval workflow.

## Phase 10 — usage analytics and routing — completed 2026-11-23

- Analytics from recorded `UsageEvent` rows only: totals, success rate, tokens,
  list-price cost estimates (null when pricing is unknown), by day/provider/
  model/account breakdowns, data-source counts, and per-account quota snapshots
  from official channels where available.
- Task classifier and model ranking exposed through `POST /api/usage/preview`;
  the Router UI shows classification, signals, and ranked recommendations.
- Routing rules CRUD with modes/priorities/targets. **Deferred:** applying rules
  automatically inside the chat engine (conversation mode governs today).

## Phase 11 — security, testing, optimization — completed 2026-11-23

- Credential encryption, hint-only metadata, redacted logging, zod validation,
  per-user authorization on every route, auth throttling, CORS allowlist.
- 41 automated tests: 33 core (registry, error taxonomy, fallback runner,
  context builder, classifier) + 8 server (health, auth, provider secrecy,
  SSE fallback acceptance, continuity, overview).
- Production build: server ESM bundle + Vite assets.

### Verification (run 2026-11-23)

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ Passed — shared, core, server, web |
| `npm test` | ✅ 41 tests passed (33 core, 8 server) |
| `npm run build` | ✅ Server bundle 112 KB; web JS 345 KB (104 KB gzip) |
| Runtime smoke test | ✅ `/api/health` 200; Vite proxy; SSE error path |
| UI smoke test | ✅ Register → Overview → Providers (add/delete account with honest validation failure) → Workspace (create conversation, SSE error) → Usage → Router preview → Projects (project/memory/task CRUD, delete) → Conversations → Settings; no console errors |

## UI overhaul — completed 2026-11-23

- Rebuilt the design foundation on Tailwind v4 `@theme` tokens: dark canvas,
  layered panels, aurora/grid backdrops, glass surfaces, custom motion
  (fade-up, scale-in, shimmer, pulse-soft), Inter / Space Grotesk / JetBrains
  Mono typography, and a shared icon set (`lucide-react`).
- Expanded `components/ui.tsx` with card padding/glow variants, gradient
  buttons, segmented controls, modals, sparklines, provider glyphs, skeletons,
  and consistent formatters; preserved every existing data contract.
- New command palette (⌘K / Ctrl-K) for navigation, new-conversation, and sign
  out; premium auth screen; upgraded shell with provider-status pill, mobile
  drawer, user card, and page transitions.
- Redesigned all eight routes: Overview hero + provider network grid, Workspace
  three-pane cockpit (threads, chat, run inspector), Providers account cards,
  Router rule builder + preview, Analytics KPI/chart/quota layout, Projects
  context workspace, Conversations ledger, and Settings security posture.
- Honesty preserved: every number still comes from recorded events or official
  quota channels; empty and not-reported states are explicit.

### Verification (run 2026-11-23)

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ Passed — shared, core, server, web |
| `npm test` | ✅ 41 tests passed (33 core, 8 server) |
| `npm run build` | ✅ Server bundle 112 KB; web JS 439 KB (125 KB gzip), CSS 73 KB |
| UI smoke test | ✅ Register → Overview → Workspace → Providers → Router → Usage → Conversations → Projects → Settings; ⌘K palette opens; no console errors |

## Decisions log

- **2026-11-19** — Express over NestJS: fewer moving parts; module isolation is
  enforced by folder structure and interfaces instead of decorators/DI.
- **2026-11-19** — SSE over WebSocket for chat streaming; WebSocket deferred to
  the terminal phase.
- **2026-11-19** — GitHub adapter targets the GA Copilot SDK (`@github/copilot-sdk`,
  agent runtime). GitHub Models was retired on 2026-07-30 and is explicitly out
  of scope; capability flag `integration: "sdk"` added for this adapter.
- **2026-11-19** — Qoder adapter uses Qoder CLI headless mode with
  `QODER_PERSONAL_ACCESS_TOKEN`; no private REST endpoints are assumed.
- **2026-11-19** — Workspace packages are consumed as TS sources (no per-package
  build step); the server bundle and Vite inline them.
- **2026-11-23** — Cooldowns are kept in an in-memory map with explicit
  timestamps; Redis remains optional and is not required for single-node usage.
- **2026-11-23** — Routing rules are persisted configuration; execution follows
  the conversation's routing mode until rule evaluation is implemented.

## Known limitations

- Usage reporting: GitHub has no per-request quota API; Qoder exposes usage only
  interactively. Both render explicit unavailable states; token counts stay blank.
- Token usage for Copilot depends on SDK `assistant.usage` events; Qoder reports
  none.
- Repository indexing, tool execution, terminal, Monaco editor, and desktop/IDE
  clients are not part of this build.
- Routing-rule auto-application and Redis-backed distributed cooldowns are
  deferred.
- `npm audit` currently reports high-severity advisories in transitive
  dev/build tooling; no runtime dependency has been identified as affected.

## Next up

1. Apply routing rules in the orchestrator (conditions → target mode/model).
2. Repository indexing + retrieval (pgvector) and file-change capture with
   approval-gated edits.
3. Terminal and tool execution with allowlists and approval workflow.
4. Desktop/VS Code clients over the same HTTP/SSE contract.
