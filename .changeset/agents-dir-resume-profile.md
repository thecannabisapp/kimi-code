---
"@moonshot-ai/agent-core": patch
"@moonshot-ai/kimi-code": patch
---

Fix `--agents-dir` custom system prompt being overwritten by the bundled default after compaction: on session resume the persisted profile handle was restored from the bundled defaults only, so the post-compaction `refreshSystemPrompt()` re-rendered the default prompt. Custom profiles now take precedence over the agentfile catalog on resume, for both main and sub agents. Also fix AgentSwarm `thinking_level` / `model` arguments being silently dropped before reaching spawned subagents.
