# OneGo

**Unified AI coding hub — one workspace, multiple AI providers, shared memory, intelligent routing, uninterrupted workflow.**

OneGo connects OpenAI/Codex, Anthropic/Claude, GitHub, and Qoder behind a single
interface. Conversations, project context, and task state belong to the platform
rather than to any individual provider, so work continues seamlessly when a
provider hits a usage limit or when a different model fits the task better.

## Stack

- **Web:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router
- **API:** Node.js, TypeScript, Express, zod, pino
- **Core:** provider-agnostic adapter contract, registry, error taxonomy (Vitest)
- **Data:** PostgreSQL 16 + Prisma, Redis 7 (planned for limits/queues)
- **Integrations:** official APIs only — see [docs/provider-integrations.md](docs/provider-integrations.md)

## Features

- **Provider accounts** — OpenAI, Anthropic, GitHub Copilot (official SDK), and
  Qoder (official CLI), each validated against its real service; credentials are
  encrypted with AES-256-GCM and never returned to the browser.
- **Orchestrated chat** — one SSE stream per turn with attempt telemetry,
  automatic fallback on quota/rate-limit/auth failures, cooldowns, and explicit
  switch records.
- **Continuity** — conversation history, project memory, and task state are
  re-sent to whichever provider answers next; versioned context snapshots.
- **Routing modes** — manual (pick account/model), automatic (priority order),
  intelligent (local task classification ranks synced models). Routing rules are
  stored and previewable; automatic rule application is upcoming.
- **Usage analytics** — totals, per-day/provider/model/account breakdowns, and
  cost estimates from list prices. Unreported values stay blank — never invented.
- **Workspace UI** — overview dashboard, streaming chat workspace, provider
  management, projects with memory and tasks, conversations, router, settings.

## Quick start

Requirements: Node.js ≥ 20, PostgreSQL (Docker Compose provided).

```bash
# 1. Configure environment
cp .env.example .env
node -e "console.log('CREDENTIAL_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
# paste both values into .env

# 2. Start infrastructure
npm run docker:up

# 3. Install and prepare the database
npm install
npm run db:generate
npm run db:migrate -w @onego/server -- --name init

# 4. Run API (:4000) and web (:5173)
npm run dev
```

Health check: <http://localhost:4000/api/health>

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and web together |
| `npm run build` | Typecheck, then build server bundle and web assets |
| `npm run typecheck` | Typecheck every workspace |
| `npm test` | Unit + integration tests (core and server) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Prisma workflows |
| `npm run docker:up` | Start PostgreSQL and Redis |

## Repository layout

```
apps/server     Express API, Prisma schema, orchestration modules
apps/web        React workspace shell
packages/shared Domain types shared across client and server
packages/core   Adapter contract, registry, error taxonomy
docs/           Architecture and provider integration research
```

## Documentation

- [Architecture](docs/architecture.md) — modules, request lifecycle, fallback policy, security
- [Provider integrations](docs/provider-integrations.md) — what each provider officially supports
- [Development progress](DEVELOPMENT_PROGRESS.md) — phase status and next steps

## API surface

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | Accounts and sessions |
| `GET /api/providers`, `POST /api/providers/:key/accounts`, `PATCH/DELETE /api/providers/accounts/:id` | Provider accounts |
| `POST /api/providers/accounts/:id/validate`, `.../models/sync`, `GET .../usage` | Validation, model sync, usage probe |
| `GET/POST /api/conversations`, `GET/PATCH/DELETE /api/conversations/:id` | Conversation lifecycle |
| `POST /api/conversations/:id/messages` | Orchestrated SSE turn with fallback |
| `GET/POST /api/projects`, `.../memories`, `.../tasks`, `.../repositories` | Project context |
| `POST /api/repositories/:id/index`, `GET /api/projects/:id/search` | Local indexing and lexical code retrieval |
| `GET /api/usage/summary`, `/accounts`, `/catalog`, `POST /preview` | Analytics and routing preview |
| `GET/POST/PATCH/DELETE /api/routing/rules` | Routing rule configuration |
| `GET /api/overview`, `GET /api/health` | Dashboard and health |

All `/api` routes except auth and health require `Authorization: Bearer <token>`.

## State of the build

Phases 1–7 and 10–11 are complete; phases 8 and 9 are partial. See
[DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md) for the exact delivered scope.
Repository indexing and lexical code retrieval are implemented (PostgreSQL
full-text search over local chunks). Semantic/pgvector retrieval, terminal/tool
execution, the Monaco editor, and desktop/IDE clients are not implemented. No
provider connections are simulated and no usage values are fabricated anywhere
in the codebase.
