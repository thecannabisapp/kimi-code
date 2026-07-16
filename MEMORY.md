# Memory

## 2026-07-16 — Upstream merge v0.26.0

- Merged `MoonshotAI/kimi-code` `upstream/main` at v0.26.0 (185 commits, v0.23.3 → v0.26.0) into `main` (`0c529fba2`).
- Conflicts were additive-only in 3 files (`agent-core/src/rpc/core-impl.ts`, `agent-core/src/session/index.ts`, `node-sdk/src/sdk-rpc-client.ts`); resolved by union — upstream's `uiMode`/`imageLimits`/MCP-auth additions plus our `agentsDir`/`profiles`/`initPrompt` wiring.
- `--agents-dir` verified end-to-end on v1: option in built bundle help, `loadCustomAgentProfiles` shadows `profile/default/system.md` and `init.md`, defaults unaffected; typecheck/lint/build green.
- Test suite: 29 failures, all 5 s timeouts in NEW upstream packages (`minidb`, `agent-core-v2`, `kap-server`, `acp-adapter`, one `agent-core` fs-rotation test) — byte-identical to upstream, pass standalone/with longer timeout. Same resource-sensitivity class as the v0.23.3 note, amplified by upstream's new fs/image-heavy tests. Not merge regressions.
- Upstream structural changes: `packages/server` DELETED → replaced by `packages/kap-server` (v2 engine, Fastify); `packages/server-e2e` DELETED → suites moved to `packages/klient/test/e2e/`; new packages `agent-core-v2`, `klient`, `minidb`; `apps/vscode` moved into the monorepo. v1 `agent-core` also gained an in-process DI facade at `src/services/`.
- CRITICAL for `--agents-dir`: agent-core-v2 has NO file-based profile loading — profiles are code-registered (`registerAgentProfile`, 4 hardcoded TS profiles, single bundled `system.md`, constant `DEFAULT_INIT_PROMPT`). `--agents-dir` is silently ignored on v2 paths: `kimi -p` with `KIMI_CODE_EXPERIMENTAL_FLAG=1`, and ALL kap-server sessions (`kimi server run`, `kimi web` are always v2). TUI and default `kimi -p` remain v1 and fully honour the option. Porting to v2 would need a bootstrap seed that dir-scans and calls `registerAgentProfile` + an init-prompt override into `sessionInitService` — does not exist upstream.
- `apps/kimi-code` `dev:cli-only` tsx path fails on upstream's new parameter decorators (`coreProcessService.ts`); pre-existing upstream config gap (tsconfig not passed to tsx for agent-core files), not merge damage. Production tsdown bundle unaffected.

## 2026-07-09 — Upstream merge v0.23.3

- Merged `MoonshotAI/kimi-code` release `@moonshot-ai/kimi-code@0.23.3` into `main`.
- Preserved local customisations:
  - `--agents-dir` CLI option and `agentsDir` wiring through `apps/kimi-code`, `packages/agent-core`, and `packages/node-sdk`.
  - Custom agent prompt injection via `packages/agent-core/src/profile/custom-loader.ts` (`.yaml` profile overrides and `.md` system/init prompts).
  - Chrome-overlay TUI layout (`mountChromeOverlay`, `ChromeAwareContainer`, `tasks-browser` chrome hiding).
- Reconciled package rename: local chrome-overlay files imported `@earendil-works/pi-tui`; updated to the upstream workspace package `@moonshot-ai/pi-tui` so the merged tree typechecks.
- Removed the local 15 s goal-continuation throttle (`goalContinuationMinIntervalMs`) because upstream v0.23.3 removed it and the harness tests expect rapid sequential goal turns.
- Full `pnpm run test` shows a handful of 5 s timeouts in image-compression / fs-heavy tests when the whole suite runs concurrently; those same tests pass when rerun individually. This looks like resource contention rather than a regression from the merge.
