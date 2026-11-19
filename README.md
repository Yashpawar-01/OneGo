# OneGo

**Unified AI coding hub — one workspace, multiple AI providers, shared memory, intelligent routing, uninterrupted workflow.**

OneGo connects multiple AI coding providers (OpenAI/Codex, Anthropic/Claude, GitHub Copilot, Qoder) behind a single interface. Conversations, project context, and task state belong to the platform rather than to any individual provider, so work continues seamlessly when a provider hits a usage limit or when a different model is a better fit for the task.

## Planned architecture

| System | Responsibility |
| --- | --- |
| Provider Management | Adapters, credentials, connectivity, capabilities |
| AI Orchestration Engine | Request routing, streaming, retries, logging |
| Fallback Engine | Quota/rate-limit detection, automatic provider switching |
| Intelligent Model Router | Manual / Automatic / Intelligent modes |
| Conversation Continuity | Cross-provider context transfer and resume |
| Project Memory & Context | Versioned snapshots, token-aware context packages |
| Unified Workspace | Chat, editor, file explorer, terminal |
| Repository Engine | Indexing, semantic search, git diffs |
| Usage & Analytics | Quotas, token usage, cost estimates, fallback history |
| Security | Encrypted credentials, audit logs, approval for destructive actions |

## Status

Repository initialized. Architecture, schema, and implementation follow the development phases in `DEVELOPMENT_PROGRESS.md` (to be added).
