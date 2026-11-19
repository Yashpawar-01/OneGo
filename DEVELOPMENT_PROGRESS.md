# Development progress

Tracking implementation against the phased plan. Updated at the end of every
phase, together with test results and any deviations.

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture, repository setup, schema, adapter contracts | ✅ Complete |
| 2 | UI shell and dashboard | ▶ Next |
| 3 | Authentication and provider management | ⏳ Pending |
| 4 | Provider adapters (OpenAI, Anthropic, GitHub, Qoder) | ⏳ Pending |
| 5 | Unified chat + streaming | ⏳ Pending |
| 6 | Automatic fallback engine | ⏳ Pending |
| 7 | Cross-provider conversation continuity | ⏳ Pending |
| 8 | Project memory and repository indexing | ⏳ Pending |
| 9 | Unified coding workspace (editor, terminal, tools) | ⏳ Pending |
| 10 | Usage analytics and intelligent routing | ⏳ Pending |
| 11 | Security hardening, testing, optimization | ⏳ Pending |
| 12 | Desktop and IDE integrations | ⏳ Pending |

## Phase 1 — completed 2026-11-19

### Delivered

- npm-workspaces monorepo: `apps/server`, `apps/web`, `packages/shared`, `packages/core`
- Strict TypeScript base config with shared path aliases; tsup for the server, Vite for the web
- PostgreSQL + Prisma schema covering every entity from the brief, plus two additions:
  - `ConversationEvent` — append-only log for event-based state reconstruction
  - `UsageEvent` — per-request usage rows for historical analytics
  - (`AuditLog` also added for the security requirements)
- Credential storage designed as AES-256-GCM ciphertext with key versioning;
  no plaintext credential columns exist in the schema
- Provider-agnostic adapter contract with optional operations
  (`getUsage`, `streamResponse`) and explicit capability flags
- Adapter registry with priority ordering and enable/disable support
- Error taxonomy with quota-vs-rate-limit separation, retry-after parsing, and
  12 unit tests (Vitest)
- Express server: zod-validated env, pino redaction, CORS allowlist, structured
  404/500 handling, `/api/health`, graceful shutdown
- React/Vite/Tailwind workspace shell with the planned navigation routes;
  placeholders state that no mock data exists
- Docker Compose for Postgres 16 + Redis 7
- Architecture and provider-integration research docs (official capabilities
  and documented limitations per provider)

### Verification (run 2026-11-19)

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ Passed — shared, core, server, web |
| `npm test` | ✅ 17 tests passed (core 15, server 2) |
| `prisma validate` | ✅ Schema valid |
| `prisma generate` | ✅ Client v6.19.3 generated |
| `npm run build` | ✅ Server bundle 4.21 KB; web assets built (270 KB JS) |
| Runtime smoke test | ✅ `/api/health` 200, structured JSON 404, request logging |
| UI smoke test | ✅ Vite dev server rendered the shell and all 8 routes |

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

## Known limitations / open questions

- Usage reporting: GitHub has no per-subscription quota API; Qoder exposes usage
  only interactively. Both will render the explicit "usage unavailable" state.
- GitHub integration route (Models API vs Copilot SDK) must be re-validated in
  Phase 4 against current docs and entitlements.
- Redis is provisioned but not yet wired (rate limits/queues in Phases 5–6).
- Authentication is not implemented yet; the API currently exposes only health.

## Next up — Phase 2 (dashboard UI)

1. shadcn/ui setup and shared design tokens.
2. Overview dashboard wired to a real `/api/overview` endpoint (empty-state
   aware; no seeded statistics).
3. Layout polish: responsive sidebar, top bar provider indicator, routing-mode chip.
4. Web tests for critical shell behavior (Vitest + Testing Library).
