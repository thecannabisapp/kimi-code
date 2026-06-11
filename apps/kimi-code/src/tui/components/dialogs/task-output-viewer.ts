/**
 * TaskOutputViewer — full-screen pi-tui rendered output viewer for
 * a single background task. Replaces the previous "shell out to less"
 * approach so the experience stays inside the TUI: same colors, same
 * fonts, same redraw cycle, no alt-screen flip-flop.
 *
 * Mounted by `kimi-tui.ts` via nested container swap on top of the
 * TasksBrowserApp. Snapshot view (no live tail) — content is fetched
 * once when the viewer opens.
 *
 * The body is rendered through pi-tui's `Markdown` component using the
 * same theme as assistant messages, so markdown/ANSI formatting, code
 * blocks, and line wrapping all behave consistently with the rest of
 * the transcript. By default the line order is reversed so the most
 * recent output appears at the top of the body; pass `reverseOrder:
 * false` to keep oldest-first order.
 */

import {
  Container,
  Key,
  Markdown,
  matchesKey,
  type Terminal,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@earendil-works/pi-tui';
import type { BackgroundTaskInfo, BackgroundTaskStatus } from '@moonshot-ai/kimi-code-sdk';

import { currentTheme } from '#/tui/theme';
import { createMarkdownTheme } from '#/tui/theme/pi-tui-theme';
import { printableChar } from '@/tui/utils/printable-key';

const ELLIPSIS = '…';
const EMPTY_OUTPUT = '[no output captured]';

export interface TaskOutputViewerProps {
  readonly taskId: string;
  readonly info: BackgroundTaskInfo | undefined;
  readonly output: string;
  readonly onClose: () => void;
  /** Reverse the line order so newest output is at the top. Defaults to true. */
  readonly reverseOrder?: boolean;
}

const STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  timed_out: 'timed out',
  killed: 'killed',
  lost: 'lost',
};

function statusColor(status: BackgroundTaskStatus): 'success' | 'textMuted' | 'error' {
  switch (status) {
    case 'running':
      return 'success';
    case 'completed':
      return 'textMuted';
    case 'failed':
    case 'timed_out':
    case 'killed':
    case 'lost':
      return 'error';
  }
}

function padToWidth(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w === width) return line;
  if (w > width) return truncateToWidth(line, width, ELLIPSIS);
  return line + ' '.repeat(width - w);
}

function fitExactly(line: string, width: number): string {
  let s = line;
  if (visibleWidth(s) > width) s = truncateToWidth(s, width, ELLIPSIS);
  return padToWidth(s, width);
}

export class TaskOutputViewer extends Container implements Focusable {
  focused = false;

  private props: TaskOutputViewerProps;
  private readonly terminal: Terminal;
  /** Output split on '\n'. Replaced on `setProps` when `output` changes. */
  private lines: string[];
  /** Topmost visible wrapped display line. In reversed mode 0 == newest output. */
  private scrollTop = 0;
  /** Markdown renderer; rebuilt on theme changes via `invalidate()`. */
  private readonly markdown: Markdown;
  /** Cache of the last rendered body slice to avoid re-parsing Markdown each frame. */
  private cachedBodyWidth = 0;
  private cachedBodyLines: string[] | undefined;

  constructor(props: TaskOutputViewerProps, terminal: Terminal) {
    super();
    this.props = props;
    this.terminal = terminal;
    this.lines = this.splitOutput(props.output);
    this.markdown = new Markdown(
      this.buildMarkdownText(),
      0,
      0,
      createMarkdownTheme(),
      { color: (text) => currentTheme.fg('text', text) },
    );
  }

  /**
   * Update viewer props. When `output` grows (the watched task wrote
   * new content), keep the user at the top in reversed mode so the
   * latest output stays visible; in oldest-first mode follow the tail
   * like `less +F`. Otherwise preserve the user's scroll position and
   * clamp it to the new bounds.
   */
  setProps(next: TaskOutputViewerProps): void {
    const previousOutput = this.props.output;
    const previousReverse = this.reverseOrder();
    const wasAtTop = this.scrollTop === 0;
    const wasAtBottom = this.scrollTop >= this.maxScroll();
    this.props = next;

    if (next.output !== previousOutput || previousReverse !== this.reverseOrder()) {
      this.lines = this.splitOutput(next.output);
      this.markdown.setText(this.buildMarkdownText());
      this.cachedBodyLines = undefined;

      if (this.reverseOrder()) {
        this.scrollTop = wasAtTop ? 0 : Math.min(this.scrollTop, this.maxScroll());
      } else {
        this.scrollTop = wasAtBottom ? this.maxScroll() : Math.min(this.scrollTop, this.maxScroll());
      }
    }
    this.invalidate();
  }

  private reverseOrder(): boolean {
    return this.props.reverseOrder ?? true;
  }

  private splitOutput(output: string): string[] {
    return output.length > 0 ? output.split('\n') : [];
  }

  private buildMarkdownText(): string {
    if (this.lines.length === 0) return EMPTY_OUTPUT;
    if (this.reverseOrder()) return this.lines.toReversed().join('\n');
    return this.lines.join('\n');
  }

  // ── input ──────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const visible = this.viewableRows();
    const k = printableChar(data);

    if (matchesKey(data, Key.escape) || k === 'q' || k === 'Q') {
      this.props.onClose();
      return;
    }
    // Scroll keys move the viewport, not the logical buffer: Up scrolls toward
    // the top of the screen and Down toward the bottom. In reversed mode that
    // reveals newer / older output respectively; in oldest-first mode it is the
    // opposite. This keeps the key mapping visually consistent with the rest of
    // the TUI.
    if (matchesKey(data, Key.up) || k === 'k') {
      this.scrollBy(-1);
      return;
    }
    if (matchesKey(data, Key.down) || k === 'j') {
      this.scrollBy(1);
      return;
    }
    if (matchesKey(data, Key.pageUp) || k === ' ' || data === '\u0002' /* C-b */) {
      this.scrollBy(-Math.max(1, visible - 1));
      return;
    }
    if (matchesKey(data, Key.pageDown) || data === '\u0006' /* C-f */) {
      this.scrollBy(Math.max(1, visible - 1));
      return;
    }
    if (matchesKey(data, Key.home) || k === 'g') {
      this.scrollTo(0);
      return;
    }
    if (matchesKey(data, Key.end) || k === 'G') {
      this.scrollTo(this.maxScroll());
      return;
    }
  }

  private scrollBy(delta: number): void {
    this.scrollTo(this.scrollTop + delta);
  }

  private scrollTo(target: number): void {
    this.scrollTop = Math.max(0, Math.min(target, this.maxScroll()));
    this.invalidate();
  }

  private maxScroll(innerWidth = Math.max(1, this.terminal.columns - 4)): number {
    const bodyLines = this.getBodyLines(innerWidth);
    return Math.max(0, bodyLines.length - this.viewableRows());
  }

  /**
   * Number of content rows visible inside the body frame: total terminal
   * rows minus header(1) + footer(1) + top border(1) + bottom border(1).
   */
  private viewableRows(): number {
    return Math.max(1, this.terminal.rows - 4);
  }

  // ── render ─────────────────────────────────────────────────────────

  override invalidate(): void {
    this.cachedBodyLines = undefined;
    this.markdown.invalidate();
    super.invalidate();
  }

  override render(width: number): string[] {
    const rows = Math.max(3, this.terminal.rows);
    const bodyHeight = rows - 2;

    const header = this.renderHeader(width);
    const body = this.renderBody(width, bodyHeight);
    const footer = this.renderFooter(width, bodyHeight);

    const out: string[] = [header];
    for (const line of body) out.push(line);
    out.push(footer);
    return out;
  }

  private renderHeader(width: number): string {
    const title = currentTheme.boldFg('primary', ' Task output ');
    const id = currentTheme.boldFg('text', this.props.taskId);
    const info = this.props.info;
    const segments: string[] = [];
    if (info !== undefined) {
      segments.push(currentTheme.fg(statusColor(info.status), STATUS_LABEL[info.status]));
      if (info.kind === 'process' && info.exitCode !== null) {
        segments.push(currentTheme.fg('textMuted', `exit ${String(info.exitCode)}`));
      }
      if (info.description && info.description.length > 0) {
        segments.push(currentTheme.fg('textMuted', info.description));
      }
    }
    const composed = title + id + (segments.length > 0 ? '  ' + segments.join('  ') : '');
    return fitExactly(composed, width);
  }

  private renderBody(width: number, bodyHeight: number): string[] {
    // Reserve 1 col for left/right border each, 1 col for left/right padding.
    const innerWidth = Math.max(1, width - 4);
    const viewRows = Math.max(1, bodyHeight - 2);

    // Re-clamp scroll in case the terminal got resized smaller.
    this.scrollTop = Math.min(this.scrollTop, this.maxScroll(innerWidth));

    const top = currentTheme.fg('primary', '┌' + '─'.repeat(Math.max(0, width - 2)) + '┐');
    const bottom = currentTheme.fg('primary', '└' + '─'.repeat(Math.max(0, width - 2)) + '┘');

    const bodyLines = this.getBodyLines(innerWidth);
    const visibleLines = bodyLines.slice(this.scrollTop, this.scrollTop + viewRows);

    const out: string[] = [top];
    for (const raw of visibleLines) {
      out.push(currentTheme.fg('primary', '│ ') + raw + currentTheme.fg('primary', ' │'));
    }
    for (let i = visibleLines.length; i < viewRows; i++) {
      out.push(currentTheme.fg('primary', '│ ') + ' '.repeat(innerWidth) + currentTheme.fg('primary', ' │'));
    }
    out.push(bottom);
    return out;
  }

  private getBodyLines(innerWidth: number): string[] {
    if (this.cachedBodyLines !== undefined && this.cachedBodyWidth === innerWidth) {
      return this.cachedBodyLines;
    }
    this.cachedBodyLines = this.markdown.render(innerWidth);
    this.cachedBodyWidth = innerWidth;
    return this.cachedBodyLines;
  }

  private renderFooter(width: number, bodyHeight: number): string {
    const key = (text: string): string => currentTheme.boldFg('primary', text);
    const dim = (text: string): string => currentTheme.fg('textMuted', text);

    const innerWidth = Math.max(1, width - 4);
    const bodyLines = this.getBodyLines(innerWidth);
    const total = bodyLines.length;
    const viewRows = Math.max(1, bodyHeight - 2);
    const maxScroll = Math.max(0, total - viewRows);
    const percent = maxScroll === 0 ? 100 : Math.round((this.scrollTop / maxScroll) * 100);
    const lineFrom = this.scrollTop + 1;
    const lineTo = Math.min(total, this.scrollTop + viewRows);

    const position = currentTheme.fg(
      'textMuted',
      ` ${String(lineFrom)}-${String(lineTo)} / ${String(total)} (${String(percent)}%) `,
    );
    const keys =
      `${key('↑↓')} ${dim('line')}  ` +
      `${key('PgUp/PgDn')} ${dim('page')}  ` +
      `${key('g/G')} ${dim('top/bot')}  ` +
      `${key('Q/Esc')} ${dim('cancel')}`;
    const left = ` ${keys}`;
    const leftW = visibleWidth(left);
    const rightW = visibleWidth(position);
    if (leftW + 2 + rightW <= width) {
      return left + ' '.repeat(width - leftW - rightW) + position;
    }
    return fitExactly(left, width);
  }
}
