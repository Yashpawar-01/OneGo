# Provider integration research

Status: verified 2026-11. This document defines what OneGo can legitimately
integrate with, and what it must refuse to fake.

## Summary

| Provider | Official programmatic path | Auth | Chat/stream | Usage data | Subscription quota readable? |
| --- | --- | --- | --- | --- | --- |
| OpenAI / Codex | OpenAI Platform API | API key (org/project) | Yes / SSE | Usage & Costs APIs (Admin key), rate-limit headers | No — ChatGPT plans are separate from API billing |
| Anthropic / Claude | Anthropic Messages API | API key (`x-api-key`) | Yes / SSE | Admin API usage/cost reports (Admin key), `anthropic-ratelimit-*` headers | No — Claude Pro/Max limits are not exposed to third-party API clients |
| GitHub Copilot | GitHub Copilot SDK (`@github/copilot-sdk`) | Signed-in user, OAuth app, server-to-server token, BYOK | Yes / streaming | None exposed per-request | Partially — AI credits are usage-based; no per-request quota API |
| Qoder | Qoder CLI (headless mode) | `QODER_PERSONAL_ACCESS_TOKEN` PAT | Via CLI subprocess | Interactive `/status` only | No — no public REST inference API |

## OpenAI / Codex

- **Integration:** OpenAI Platform API. The Responses API is the current
  primary surface for chat, tools, and streaming; Chat Completions remains
  supported. A project-scoped API key is the standard auth method.
- **Errors:** HTTP 429 with `error.code = "insufficient_quota"` indicates hard
  quota/billing exhaustion (do not retry). Other 429s are rate limits and
  include `retry-after` plus `x-ratelimit-*` headers.
- **Usage:** per-org/project Usage and Costs endpoints exist but require an
  Admin key, not a regular inference key. Without it, OneGo can only show
  rate-limit header data and locally estimated token usage.
- **Not supported:** ChatGPT/Codex subscription entitlements are not an API
  credential; they cannot be used to call the Platform API. OneGo must not
  extract session tokens or scrape the web app.

## Anthropic / Claude

- **Integration:** Anthropic Messages API with `x-api-key` and `anthropic-version`
  headers. Streaming uses SSE; tool use is supported.
- **Errors:** 401 authentication, 403 permission, 429 `rate_limit_error` with
  `retry-after` and `anthropic-ratelimit-*` headers. Messages about exhausted
  credits or subscription usage limits are classified as `quota_exhausted` and
  never retried.
- **Usage:** the Admin API exposes usage and cost reports (Admin key). Regular
  inference keys cannot read quota balances; rate-limit headers are the only
  per-request signal.
- **Not supported:** Claude Pro/Max subscription limits are not available to
  third-party integrations. Claude Code OAuth credentials are restricted to
  first-party clients and must not be repurposed.

## GitHub Copilot

- **GitHub Models is retired** (July 30, 2026). Its playground, catalog,
  inference API, and BYOK are gone; do not build against it. Microsoft Foundry
  is GitHub's suggested replacement for raw model access.
- **Supported path:** the **GitHub Copilot SDK** (`@github/copilot-sdk`),
  generally available since June 2, 2026. It embeds Copilot's agent runtime
  (planning, tool invocation, file edits, streaming, multi-turn sessions) and
  ships for Node.js/TypeScript, Python, Go, .NET, Rust, and Java — so the server
  can drive it in-process or via the bundled CLI session.
- **Authentication:** signed-in users, OAuth apps, environment variables,
  server-to-server tokens (organization billing), and BYOK. Headless
  operation is supported via CI/CD or service accounts.
- **Billing:** available to Copilot subscribers (including Copilot Free) and to
  non-subscribers via BYOK. Since June 2026 Copilot uses usage-based AI
  credits; server-to-server deployments bill through the organization.
- **Implementation choice:** the "GitHub" adapter targets the Copilot SDK with
  `integration: "sdk"`. Because the SDK is agent-oriented rather than a plain
  chat-completions endpoint, the adapter maps SDK session events to platform
  `StreamEvent`s and treats its tool/file operations as tool executions under
  the platform's approval rules.
- **UI implication:** there is no per-request quota API; Copilot credit usage is
  shown as unavailable (`UsageSource.UNAVAILABLE`) unless the org billing API
  is explicitly configured in a later phase.

## Qoder

- **No public REST inference API.** Qoder is accessed through the IDE or the
  official Qoder CLI.
- **Supported path:** Qoder CLI headless/non-interactive mode. Authenticate with
  a Personal Access Token created at `qoder.com/account/integrations` and passed
  via `QODER_PERSONAL_ACCESS_TOKEN`. The server invokes the CLI as a subprocess
  with an explicit prompt and parses its output (streaming stdout can be mapped
  to `StreamEvent`s).
- **Usage:** the interactive `/status` panel shows plan and quota, but there is
  no documented machine-readable usage endpoint. `usageReporting: "none"` until
  an official interface exists.
- **Constraints:** the CLI must be installed on the server host; subprocess
  execution must be sandboxed, use an allowlisted working directory, and never
  pass secrets on the command line (env only).

## Implementation status (2026-11-23)

| Provider | Adapter | Endpoint / mechanism | Usage captured |
| --- | --- | --- | --- |
| OpenAI | `packages/core/src/adapters/openai.ts` | HTTP `POST /v1/chat/completions` (stream + non-stream) | From response usage; rate-limit headers classified |
| Anthropic | `packages/core/src/adapters/anthropic.ts` | HTTP `POST /v1/messages` (stream + non-stream) | From response usage; `anthropic-ratelimit-*` parsed |
| GitHub Copilot | `apps/server/src/adapters/copilot.ts` | `@github/copilot-sdk` session with streaming deltas | `assistant.usage` events when present; otherwise unavailable |
| Qoder | `apps/server/src/adapters/qoder-cli.ts` | `qoder -p --output-format text|json` subprocess | None exposed; JSON usage parsed if the CLI reports it |

Implementation notes:

- **OpenAI** uses Chat Completions for broad model coverage; Chat Completions
  remains supported alongside the Responses API. `insufficient_quota` is a hard
  stop (never retried); other 429s honour `retry-after`.
- **Anthropic** sends `x-api-key` plus `anthropic-version`; credit/subscription
  exhaustion messages are classified as `quota_exhausted`.
- **Copilot** pools SDK clients per token hash and stops them after 5 idle
  minutes. Session permission requests are denied by default — OneGo does not
  auto-approve file edits or shell commands. The token comes from the account
  credential and `useLoggedInUser` is disabled.
- **Qoder** requires the official CLI on the host. The token is passed via
  environment variables only (never argv), permission prompts are not
  auto-approved (no `--yolo`), and model defaults to `auto` unless configured.

## Cross-cutting rules

1. Never extract credentials from IDE sessions, keychains, or browser storage.
2. Never bypass rate limits, quotas, or ToS with rotating unauthorized tokens.
3. Distinguish *subscription access* from *API billing* in every UI surface.
4. If a provider exposes no usage API, store
   `UsageSource.UNAVAILABLE` and render the explicit unavailable state.
5. Adapters declare unsupported operations by omitting them and setting
   capability flags to `false`/`none` — no throwing stubs.

## Sources

- OpenAI API error codes and rate limits — https://platform.openai.com/docs/guides/error-codes
- OpenAI Usage/Costs Admin API — https://platform.openai.com/docs/api-reference/usage
- Anthropic API errors — https://docs.anthropic.com/en/api/errors
- Anthropic rate limits — https://docs.anthropic.com/en/api/rate-limits
- Anthropic Admin usage/cost reports — https://docs.anthropic.com/en/api/admin-api/usage-cost/get-messages-usage-report
- GitHub Models retirement announcement — https://github.blog/changelog/2026-07-30-github-models-is-now-retired/
- Copilot SDK GA announcement — https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/
- Copilot SDK authentication — https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate
- Copilot SDK repository — https://github.com/github/copilot-sdk
- Qoder CLI authentication (PAT) — https://docs.qoder.com/cli/authentication
- Qoder CLI commands — https://docs.qoder.com/cli/cli-reference
- Qoder CLI overview — https://docs.qoder.com/cli/overview
