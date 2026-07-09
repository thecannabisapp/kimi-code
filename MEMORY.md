# Memory

## 2026-07-09 — Upstream merge v0.23.3

- Merged `MoonshotAI/kimi-code` release `@moonshot-ai/kimi-code@0.23.3` into `main`.
- Preserved local customisations:
  - `--agents-dir` CLI option and `agentsDir` wiring through `apps/kimi-code`, `packages/agent-core`, and `packages/node-sdk`.
  - Custom agent prompt injection via `packages/agent-core/src/profile/custom-loader.ts` (`.yaml` profile overrides and `.md` system/init prompts).
  - Chrome-overlay TUI layout (`mountChromeOverlay`, `ChromeAwareContainer`, `tasks-browser` chrome hiding).
- Reconciled package rename: local chrome-overlay files imported `@earendil-works/pi-tui`; updated to the upstream workspace package `@moonshot-ai/pi-tui` so the merged tree typechecks.
- Removed the local 15 s goal-continuation throttle (`goalContinuationMinIntervalMs`) because upstream v0.23.3 removed it and the harness tests expect rapid sequential goal turns.
- Full `pnpm run test` shows a handful of 5 s timeouts in image-compression / fs-heavy tests when the whole suite runs concurrently; those same tests pass when rerun individually. This looks like resource contention rather than a regression from the merge.
