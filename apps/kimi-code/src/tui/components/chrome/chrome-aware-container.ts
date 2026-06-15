/**
 * Wrapper that pads the transcript for the chrome overlay and supports vertical
 * scrolling with the mouse wheel. The base transcript is padded at the bottom
 * with blank rows equal to the chrome overlay's height so the newest messages
 * are not hidden underneath it. A top padding driven by `scrollOffset` lets the
 * user wheel-scroll up through earlier messages.
 */

import { Container, type TUI } from '@earendil-works/pi-tui';

const WHEEL_SCROLL_LINES = 3;

export class ChromeAwareContainer extends Container {
  private scrollOffset = 0;

  constructor(
    private readonly chromeContainer: Container,
    private readonly tui: TUI,
  ) {
    super();
  }

  /** Scroll the transcript view up (positive delta) or down (negative delta). */
  scrollBy(delta: number): void {
    const newOffset = Math.max(0, this.scrollOffset + delta);
    if (newOffset === this.scrollOffset) return;
    this.scrollOffset = newOffset;
    this.tui.requestRender();
  }

  /** Snap back to the bottom of the transcript, e.g., when new content arrives. */
  resetScroll(): void {
    if (this.scrollOffset === 0) return;
    this.scrollOffset = 0;
    this.tui.requestRender();
  }

  /**
   * Parse a mouse wheel sequence and return the scroll delta in transcript rows,
   * or `undefined` if the input is not a wheel event.
   */
  parseMouseWheel(data: string): { scrollBy: number } | undefined {
    // SGR mouse sequence: ESC [ < B ; X ; Y M/m
    // Button codes: 64 = wheel up, 65 = wheel down.
    const match = /^\u001B\[(<(\d+);\d+;\d+)([Mm])$/.exec(data);
    if (match === null) return undefined;
    const button = Number(match[2]);
    if (button === 64) return { scrollBy: WHEEL_SCROLL_LINES };
    if (button === 65) return { scrollBy: -WHEEL_SCROLL_LINES };
    return undefined;
  }

  private chromeHeight(width: number): number {
    const chromeHeight = this.chromeContainer.render(width).length;
    const terminalRows = this.tui.terminal.rows;
    if (terminalRows <= 0) return chromeHeight;
    // Never reserve the entire terminal; leave at least one transcript row
    // visible on comically small terminals.
    return Math.min(chromeHeight, Math.max(0, terminalRows - 1));
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    const chromeHeight = this.chromeHeight(width);
    const terminalRows = this.tui.terminal.rows;
    const visibleTranscriptRows =
      terminalRows > 0 ? Math.max(1, terminalRows - chromeHeight) : lines.length;
    const maxOffset = Math.max(0, lines.length - visibleTranscriptRows);

    // Clamp to the top of the transcript.
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);

    // Bottom padding reserves space for the chrome overlay.
    const paddedLines = [
      ...lines,
      ...Array.from({ length: chromeHeight }, () => ''),
    ];

    if (this.scrollOffset <= 0) return paddedLines;

    // Top padding pushes the visible viewport up by scrollOffset rows.
    return [
      ...Array.from({ length: this.scrollOffset }, () => ''),
      ...paddedLines,
    ];
  }
}

export { WHEEL_SCROLL_LINES };
