import { Container, type Component } from '@moonshot-ai/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { ChromeAwareContainer } from '#/tui/components/chrome/chrome-aware-container';

function makeTUI(rows = 10) {
  return {
    terminal: { rows },
    requestRender: vi.fn(),
  } as unknown as import('@moonshot-ai/pi-tui').TUI;
}

function makeLinesComponent(lines: string[]): Component {
  return {
    render: () => lines,
    invalidate: () => {},
  };
}

function makeChromeContainer(height: number) {
  const container = new Container();
  container.addChild(
    makeLinesComponent(Array.from({ length: height }, (_, i) => `chrome-${i}`)),
  );
  return container;
}

describe('ChromeAwareContainer', () => {
  it('pads the transcript bottom with chrome-height blank rows', () => {
    const tui = makeTUI(10);
    const chrome = makeChromeContainer(3);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(makeLinesComponent(['line-1', 'line-2']));

    expect(wrapper.render(80)).toEqual(['line-1', 'line-2', '', '', '']);
  });

  it('leaves at least one transcript row visible on tiny terminals', () => {
    const tui = makeTUI(2);
    const chrome = makeChromeContainer(5);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(makeLinesComponent(['line-1']));

    // Chrome height clamps to rows - 1 = 1, so a single blank row is reserved.
    expect(wrapper.render(80)).toEqual(['line-1', '']);
  });
});
