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

## Quick start

Requirements: Node.js ≥ 20, Docker.

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
| `npm test` | Unit tests for core + server |
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

## Status

Phase 1 (foundation) is complete: monorepo, database schema, adapter contract,
error taxonomy with tests, API health endpoint, and a dark-first workspace
shell. Phase 2 (dashboard UI) is next. No provider connections are simulated and
no usage values are fabricated anywhere in the codebase.
