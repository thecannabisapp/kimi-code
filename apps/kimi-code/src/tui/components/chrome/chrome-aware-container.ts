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

  /** Whether the transcript is currently scrolled to the bottom. */
  isScrolledToBottom(): boolean {
    return this.scrollOffset === 0;
  }

  /**
   * Parse a mouse wheel sequence and return the scroll delta in transcript rows.
   * Returns `{ scrollBy: 0 }` for wheel releases (which should be consumed but
   * should not scroll), and `undefined` for non-wheel input.
   */
  parseMouseWheel(data: string): { scrollBy: number } | undefined {
    // SGR mouse sequence (mode 1006): ESC [ < B ; X ; Y M/m
    // Standard wheel codes are 4 (up) and 5 (down); some terminals emit 64/65.
    const sgrMatch = /^\u001B\[<(\d+);\d+;\d+([Mm])$/.exec(data);
    if (sgrMatch !== null) {
      const button = Number(sgrMatch[1]);
      const isRelease = sgrMatch[2] === 'm';
      if (button === 4 || button === 64) {
        return { scrollBy: isRelease ? 0 : WHEEL_SCROLL_LINES };
      }
      if (button === 5 || button === 65) {
        return { scrollBy: isRelease ? 0 : -WHEEL_SCROLL_LINES };
      }
      return undefined;
    }

    // Legacy X11 mouse sequence (mode 1000): ESC [ M Cb Cx Cy
    // Wheel up = button 4 -> byte 0x24 ('$'); wheel down = button 5 -> 0x25 ('%').
    const x11Match = /^\u001B\[M([\x20-\x7f])([\x20-\x7f])([\x20-\x7f])$/.exec(data);
    if (x11Match !== null) {
      const button = x11Match[1]!.charCodeAt(0) - 32;
      if (button === 4) return { scrollBy: WHEEL_SCROLL_LINES };
      if (button === 5) return { scrollBy: -WHEEL_SCROLL_LINES };
      return undefined;
    }

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
