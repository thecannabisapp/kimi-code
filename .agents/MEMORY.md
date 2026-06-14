# Memory

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
