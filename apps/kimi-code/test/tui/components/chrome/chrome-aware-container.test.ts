import { Container } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { ChromeAwareContainer } from '#/tui/components/chrome/chrome-aware-container';

function makeTUI(rows = 10) {
  return {
    terminal: { rows },
    requestRender: vi.fn(),
  } as unknown as import('@earendil-works/pi-tui').TUI;
}

function makeChromeContainer(height: number) {
  const container = new Container();
  container.addChild({
    render: () => Array.from({ length: height }, (_, i) => `chrome-${i}`),
  });
  return container;
}

describe('ChromeAwareContainer', () => {
  it('pads the transcript bottom with chrome-height blank rows', () => {
    const tui = makeTUI(10);
    const chrome = makeChromeContainer(3);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({ render: () => ['line-1', 'line-2'] });

    expect(wrapper.render(80)).toEqual([
      'line-1',
      'line-2',
      '',
      '',
      '',
    ]);
  });

  it('scrolls up by a fixed number of lines on wheel-up', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({
      render: () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    const wheelUp = wrapper.parseMouseWheel('\u001B[<64;10;5M');
    expect(wheelUp).toEqual({ scrollBy: 3 });
    wrapper.scrollBy(wheelUp!.scrollBy);

    const rendered = wrapper.render(80);
    expect(rendered[0]).toBe('');
    expect(rendered[1]).toBe('');
    expect(rendered[2]).toBe('');
    expect(rendered[3]).toBe('a');
  });

  it('scrolls down by a fixed number of lines on wheel-down', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({
      render: () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    wrapper.scrollBy(4);
    const wheelDown = wrapper.parseMouseWheel('\u001B[<65;10;5M');
    wrapper.scrollBy(wheelDown!.scrollBy);

    const rendered = wrapper.render(80);
    expect(rendered[0]).toBe('');
    expect(rendered[1]).toBe('a');
  });

  it('does not scroll below the newest content', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({ render: () => ['a', 'b'] });

    wrapper.scrollBy(-5);

    expect(wrapper.render(80)).toEqual(['a', 'b', '', '']);
  });

  it('resets scroll to the bottom when new content arrives', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({
      render: () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    wrapper.scrollBy(3);
    wrapper.resetScroll();

    const rendered = wrapper.render(80);
    expect(rendered[0]).toBe('a');
    expect(rendered[rendered.length - 1]).toBe('');
  });

  it('ignores non-wheel mouse sequences', () => {
    const tui = makeTUI(10);
    const wrapper = new ChromeAwareContainer(new Container(), tui);

    expect(wrapper.parseMouseWheel('\u001B[<0;1;1M')).toBeUndefined();
    expect(wrapper.parseMouseWheel('regular input')).toBeUndefined();
  });

  it('clamps scroll offset to the top of the transcript', () => {
    const tui = makeTUI(4);
    const chrome = makeChromeContainer(1);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild({ render: () => ['a', 'b', 'c', 'd', 'e'] });

    // Terminal shows 3 transcript rows; max offset is 2. Scrolling by 100
    // should not overshoot.
    wrapper.scrollBy(100);

    const rendered = wrapper.render(80);
    expect(rendered.filter((line) => line !== '').length).toBe(5);
    expect(rendered.at(-2)).toBe('e');
  });
});
