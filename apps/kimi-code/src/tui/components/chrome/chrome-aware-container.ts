/**
 * Wrapper that pads the transcript for the chrome overlay. The base transcript
 * is padded at the bottom with blank rows equal to the chrome overlay's height
 * so the newest messages are not hidden underneath it.
 */

import { Container, type TUI } from '@moonshot-ai/pi-tui';

export class ChromeAwareContainer extends Container {
  constructor(
    private readonly chromeContainer: Container,
    private readonly tui: TUI,
  ) {
    super();
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
    // Bottom padding reserves space for the chrome overlay.
    return [...lines, ...Array.from({ length: chromeHeight }, () => '')];
  }
}
