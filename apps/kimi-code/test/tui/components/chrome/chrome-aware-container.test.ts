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

  it('scrolls up by a fixed number of lines on SGR wheel-up', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(
      makeLinesComponent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
    );

    const wheelUp = wrapper.parseMouseWheel('\u001B[<4;10;5M');
    expect(wheelUp).toEqual({ scrollBy: 3 });
    wrapper.scrollBy(wheelUp!.scrollBy);

    const rendered = wrapper.render(80);
    expect(rendered[0]).toBe('');
    expect(rendered[1]).toBe('');
    expect(rendered[2]).toBe('');
    expect(rendered[3]).toBe('a');
  });

  it('scrolls down by a fixed number of lines on SGR wheel-down', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(
      makeLinesComponent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
    );

    wrapper.scrollBy(4);
    const wheelDown = wrapper.parseMouseWheel('\u001B[<5;10;5M');
    wrapper.scrollBy(wheelDown!.scrollBy);

    const rendered = wrapper.render(80);
    expect(rendered[0]).toBe('');
    expect(rendered[1]).toBe('a');
  });

  it('consumes SGR wheel releases without scrolling', () => {
    const tui = makeTUI(6);
    const wrapper = new ChromeAwareContainer(makeChromeContainer(1), tui);

    expect(wrapper.parseMouseWheel('\u001B[<4;10;5m')).toEqual({ scrollBy: 0 });
    expect(wrapper.parseMouseWheel('\u001B[<5;10;5m')).toEqual({ scrollBy: 0 });
  });

  it('parses legacy X11 wheel sequences', () => {
    const tui = makeTUI(6);
    const wrapper = new ChromeAwareContainer(makeChromeContainer(1), tui);

    // Button 4 -> byte 0x24 ('$'), button 5 -> byte 0x25 ('%').
    expect(wrapper.parseMouseWheel('\u001B[M$!!')).toEqual({ scrollBy: 3 });
    expect(wrapper.parseMouseWheel('\u001B[M%!!')).toEqual({ scrollBy: -3 });
  });

  it('does not scroll below the newest content', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(makeLinesComponent(['a', 'b']));

    wrapper.scrollBy(-5);

    expect(wrapper.render(80)).toEqual(['a', 'b', '', '']);
  });

  it('resets scroll to the bottom when new content arrives', () => {
    const tui = makeTUI(6);
    const chrome = makeChromeContainer(2);
    const wrapper = new ChromeAwareContainer(chrome, tui);
    wrapper.addChild(
      makeLinesComponent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
    );

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
    wrapper.addChild(makeLinesComponent(['a', 'b', 'c', 'd', 'e']));

    // Terminal shows 3 transcript rows; max offset is 2. Scrolling by 100
    // should not overshoot.
    wrapper.scrollBy(100);

    const rendered = wrapper.render(80);
    expect(rendered.filter((line) => line !== '').length).toBe(5);
    expect(rendered.at(-2)).toBe('e');
  });
});
