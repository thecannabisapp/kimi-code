/**
 * Wrapper that pads the transcript with blank rows matching the chrome
 * overlay's height. Without this padding, pi-tui shows the bottom N terminal
 * rows of the transcript, and the bottom-aligned chrome overlay paints on top
 * of them, hiding the newest messages.
 */

import { Container, type TUI } from '@earendil-works/pi-tui';

export class ChromeAwareContainer extends Container {
  constructor(
    private readonly chromeContainer: Container,
    private readonly tui: TUI,
  ) {
    super();
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    const chromeHeight = this.chromeContainer.render(width).length;
    // Never reserve the entire terminal; leave at least one transcript row
    // visible on comically small terminals.
    const terminalRows = this.tui.terminal.rows;
    const reservedRows =
      terminalRows > 0
        ? Math.min(chromeHeight, Math.max(0, terminalRows - 1))
        : chromeHeight;
    if (reservedRows <= 0) return lines;
    return [...lines, ...Array.from({ length: reservedRows }, () => '')];
  }
}
