import { TypedEmitter } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { FullscreenButton } from './FullscreenButton';
import { bindResetViewButton } from './resetViewButton';
import { TransportButtons } from './TransportButtons';
import { Wording } from './Wording';
import type { PlayerEvents } from '../player/PlayerEvents';
import { expectIconOnly, removeRenderedControls, renderControls } from '../test/controls';

interface World {
  readonly parts: ReturnType<typeof renderControls>['parts'];
  readonly calls: string[];
  readonly events: TypedEmitter<PlayerEvents>;
  readonly setPaused: (isPaused: boolean) => void;
  readonly setFullscreen: (isFullscreen: boolean) => void;
}

function world(): World {
  const { parts } = renderControls();
  const calls: string[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  let isPaused = true;
  let isFullscreen = false;
  const record = (call: string) => (): void => {
    calls.push(call);
  };
  new TransportButtons(parts, {
    player: {
      events,
      get isPaused(): boolean {
        return isPaused;
      },
    },
    togglePlay: record('toggle play'),
    wording: new Wording(),
  });
  bindResetViewButton(parts.resetView, { resetView: record('reset view') });
  const fullscreen = new FullscreenButton(parts.fullscreen, {
    toggleFullscreen: record('toggle fullscreen'),
    isFullscreen: (): boolean => isFullscreen,
  });
  return {
    parts,
    calls,
    events,
    setPaused: (paused): void => {
      isPaused = paused;
      events.emit('statuschange', paused ? 'paused' : 'playing');
    },
    setFullscreen: (filling): void => {
      isFullscreen = filling;
      fullscreen.reflect();
    },
  };
}

afterEach(() => {
  removeRenderedControls();
});

describe('the transport and view buttons', () => {
  it('passes each press on to what it names', () => {
    const { parts, calls } = world();
    for (const button of [parts.play, parts.bigPlay, parts.resetView, parts.fullscreen]) {
      button.click();
    }
    expect(calls).toEqual(['toggle play', 'toggle play', 'reset view', 'toggle fullscreen']);
  });

  it('says on both play buttons what a press does, and draws it', () => {
    const { parts, setPaused } = world();
    expect(parts.play.getAttribute('aria-label')).toBe('Play');
    expect(parts.bigPlay.getAttribute('aria-label')).toBe('Play');
    const playIcon = parts.play.getHTML();
    setPaused(false);
    expect(parts.play.getAttribute('aria-label')).toBe('Pause');
    expect(parts.bigPlay.getAttribute('aria-label')).toBe('Pause');
    expect(parts.play.getHTML()).not.toBe(playIcon);
    expectIconOnly(parts.play);
  });

  it('presses Fullscreen while the element fills the screen, and draws the way out', () => {
    const { parts, setFullscreen } = world();
    expect(parts.fullscreen.getAttribute('aria-pressed')).toBe('false');
    expect(parts.fullscreen.getAttribute('aria-label')).toBe('Fullscreen');
    const enterIcon = parts.fullscreen.getHTML();
    setFullscreen(true);
    expect(parts.fullscreen.getAttribute('aria-pressed')).toBe('true');
    expect(parts.fullscreen.getHTML()).not.toBe(enterIcon);
    expectIconOnly(parts.fullscreen);
    setFullscreen(false);
    expect(parts.fullscreen.getHTML()).toBe(enterIcon);
  });
});
