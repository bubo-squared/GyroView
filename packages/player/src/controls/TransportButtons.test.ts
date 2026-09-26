import { TypedEmitter } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { TransportButtons } from './TransportButtons';
import type { PlayerEvents } from '../player/PlayerEvents';
import { expectIconOnly, removeRenderedControls, renderControls } from '../test/controls';

interface World {
  readonly parts: ReturnType<typeof renderControls>['parts'];
  readonly calls: string[];
  readonly events: TypedEmitter<PlayerEvents>;
  readonly setPaused: (isPaused: boolean) => void;
}

function world(): World {
  const { parts } = renderControls();
  const calls: string[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  let isPaused = true;
  const record = (call: string) => (): void => {
    calls.push(call);
  };
  new TransportButtons(parts, {
    player: {
      events,
      get isPaused(): boolean {
        return isPaused;
      },
      stop: record('stop'),
      resetView: record('reset view'),
    },
    togglePlay: record('toggle play'),
    toggleFullscreen: record('toggle fullscreen'),
  });
  return {
    parts,
    calls,
    events,
    setPaused: (paused): void => {
      isPaused = paused;
      events.emit('statuschange', paused ? 'paused' : 'playing');
    },
  };
}

afterEach(() => {
  removeRenderedControls();
});

describe('TransportButtons', () => {
  it('passes each press on to what it names', () => {
    const { parts, calls } = world();
    for (const button of [
      parts.play,
      parts.bigPlay,
      parts.stop,
      parts.resetView,
      parts.fullscreen,
    ]) {
      button.click();
    }
    expect(calls).toEqual([
      'toggle play',
      'toggle play',
      'stop',
      'reset view',
      'toggle fullscreen',
    ]);
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
});
