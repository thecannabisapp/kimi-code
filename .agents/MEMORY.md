# Memory

## 2026-06-12 — Task output viewer order matches main transcript

User preference: the full-screen task output viewer reached from `/task` (the `TaskOutputViewer` component) should show output in the same order as the main TUI transcript — oldest at the top, newest at the bottom — and should start scrolled to the bottom so the latest output is visible. Auto-scroll should follow the tail (`less +F` style) when the user is already at the bottom. The component still supports an explicit `reverseOrder: true` prop for newest-at-top if ever needed, but the default is now `false`.
