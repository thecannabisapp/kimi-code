# Memory

## 2026-06-14 — Reverted alternate-screen and mouse-capture changes

The move to the alternate screen (`ESC [ ? 1049 h`) and SGR mouse tracking (`ESC [ ? 1000 / 1006 h`) broke two behaviours the user relies on:

- **Native text selection** — with mouse reporting enabled, Ghostty routes clicks/drags to the application, so drag-to-select only works while holding `Shift`.
- **Terminal scrollback / wheel scroll** — the alternate screen has no scrollback buffer, and our manual scroll offset only moves when the transcript is taller than the visible area. In a normal conversation the user expects the terminal's own scrollback to work.

Reverted in `apps/kimi-code/src/tui/kimi-tui.ts`:
- Removed `enterAlternateScreen()` / `exitAlternateScreen()` and the `alternateScreenActive` tracker.
- Removed the input listener that consumed mouse wheel events and `Shift+PageUp`/`Shift+PageDown`.
- Removed the `Key`, `matchesKey`, `WHEEL_SCROLL_LINES`, `isMouseSequence`, and `MOUSE_SEQUENCE_RE` wiring.

The TUI now runs in the primary screen again, which restores:
- drag-to-select without `Shift`,
- mouse wheel scrolling through the terminal scrollback,
- the previous visual behaviour the user asked for.

Trade-off: the duplicate-frame issue that the alternate screen was meant to fix may return. The manual-scroll code in `ChromeAwareContainer` (`scrollBy`, `parseMouseWheel`, `resetScroll`) is now dormant but left in place so a future opt-in alternate-screen / mouse-capture mode can reuse it.

Gate passed after revert: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm --filter @moonshot-ai/kimi-code run build`.

Confirmed by user after reloading a session: scrollback now works as expected. The default behaviour is that a session reload must allow the user to scroll back through the conversation using the terminal's native scrollback.

## 2026-06-14 — Upstream v0.15.0 merged; resume orphan handling refined

Merged `MoonshotAI/kimi-code` `main` (tag `@moonshot-ai/kimi-code@0.15.0`) into local `main`.
- Resolved three unmerged paths: `apps/kimi-code/tsdown.config.ts`, `packages/agent-core/src/agent/index.ts`, and `packages/agent-core/test/agent/compaction/full.test.ts`.
- Removed the consumed `.changeset/sse-mcp-servers.md`.
- Fixed a lint failure caused by an unused value import (`ChromeAwareContainer`) in `apps/kimi-code/src/tui/kimi-tui.ts`; only `WHEEL_SCROLL_LINES` is needed there because the wrapper type comes from `tui-state.ts`.
- Adjusted `ContextMemory.finishResume()` to handle two resume cases differently:
  - **Fully orphaned tool exchange** (assistant placeholder is empty and *no* tool results were ever recorded): remove the orphan `toolCalls` from the assistant placeholder, clear pending IDs, and flush deferred user messages. No synthetic `tool` message is added, so the model-visible projection can filter the empty assistant and merge adjacent user messages.
  - **Partially completed exchange** (at least one tool result exists, or the assistant has non-empty content): keep the existing upstream behaviour and synthesize error results for the missing tool calls so the conversation remains provider-valid.
- Gate passed after fixes: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and `pnpm --filter @moonshot-ai/kimi-code run build` all green. Merge commit pushed to `origin/main`.

## 2026-06-14 — Mouse wheel scroll in alternate-screen transcript

`ChromeAwareContainer` now supports vertical scrolling so the alternate-screen transcript can be scrolled with the mouse wheel. Because the move to the alternate screen removed native terminal scrollback, manual scrolling is required to view earlier conversation history:

- `scrollBy(delta)` moves the viewport up (positive) or down (negative) and clamps at the bottom (offset 0).
- `parseMouseWheel(data)` recognizes both SGR (mode 1006) and legacy X11 (mode 1000) wheel sequences. Standard SGR wheel codes are 4 (up) and 5 (down); some terminals emit 64/65, so both are accepted. Wheel releases (`m`) are consumed without scrolling.
- `resetScroll()` snaps back to the bottom; `appendTranscriptEntry` only resets when the user is already at the bottom so manual scroll position is preserved while reading history.
- The TUI enables SGR mouse mode (`ESC [ ? 1006 h`) on top of basic mouse mode (`ESC [ ? 1000 h`) so Ghostty and other modern terminals send unambiguous wheel events.
- The TUI input listener routes recognized wheel events to `transcriptWrapper.scrollBy(...)` and consumes all mouse sequences so they do not leak into the editor.
- A keyboard fallback is provided: `Shift+PageUp` / `Shift+PageDown` scrolls the transcript without interfering with the editor's `Up` / `Down` prompt history.

Key consequences for future changes:
- Do not rely on the old `isMouseEventSequence` helper; use `transcriptWrapper.parseMouseWheel` and `isMouseSequence` for consume-or-scroll decisions.
- Keep mouse mode setup and teardown symmetrical: enable `1006` after `1000`, disable `1006` before `1000` on exit.
- New transcript content should only auto-scroll the user if they are already at the bottom; otherwise leave the viewport alone.
- `clearTranscriptAndRedraw()` resets the transcript scroll offset so switching or replaying a session starts at the bottom instead of inheriting the previous session's viewport.
- Scroll offset is clamped to the top during render based on visible transcript rows; do not try to clamp it manually outside the render path.
- A session reload that fits entirely within the viewport will have no scrollable overflow — this is expected, not a bug. The alternate screen has no scrollback buffer; scrolling only becomes possible once the replayed transcript is taller than the visible area. `clearTranscriptAndRedraw()` resets the viewport to the bottom on switch so the user starts at the newest content.

## 2026-06-14 — TUI uses alternate screen buffer with pinned chrome overlay

To fix duplicate-frame rendering when the transcript grows, the Kimi Code TUI now:
1. Switches the terminal to the alternate screen buffer (`ESC [ ? 1049 h` / `ESC [ ? 1049 l`) around the pi-tui lifecycle. This is the same mechanism vim/less/htop use and is the recommended fix for pi-tui's main-buffer scrollback pollution (see earendil-works/pi discussions #1712 and issue #3083).
2. Enables basic mouse tracking (`ESC [ ? 1000 h`) while in alternate screen and consumes mouse event sequences in an input listener. Without this, terminals translate wheel scroll into arrow keys, which navigates the editor's input history.
3. Pins chrome (activity pane, todo panel, queue, BTW panel, editor, footer) as a single bottom-left, non-capturing pi-tui overlay.
4. Wraps `transcriptContainer` in `ChromeAwareContainer` to pad the transcript with blank rows equal to the chrome overlay's rendered height, so new messages stay visible above the overlay.
5. On emergency exit (SIGHUP / dead terminal), sends `SIGTERM` to the process group to reduce orphaned background tasks (e.g., firebase emulator spawned by playwright).

Key consequences for future changes:
- Do not write directly to `process.stdout` outside pi-tui while the TUI is active; the terminal is in alternate screen. Any diagnostic output must be emitted after `exitAlternateScreen()`.
- `state.chromeOverlay` must be hidden before any full-screen takeover that calls `state.ui.clear()` (e.g., `TasksBrowserController`, `ApprovalPreviewViewer`) and restored on close.
- Do not assume `state.ui.children` contains chrome components; use `state.chromeContainer.children` instead.
- Agent-swarm grid height now measures `state.chromeContainer.render(width).length`.
- The overlay has no `maxHeight`; the chrome block grows upward when the `/` slash-menu autocomplete opens.

## 2026-06-12 — Task output viewer order matches main transcript

User preference: the full-screen task output viewer reached from `/task` (the `TaskOutputViewer` component) should show output in the same order as the main TUI transcript — oldest at the top, newest at the bottom — and should start scrolled to the bottom so the latest output is visible. Auto-scroll should follow the tail (`less +F` style) when the user is already at the bottom. The component still supports an explicit `reverseOrder: true` prop for newest-at-top if ever needed, but the default is now `false`.
