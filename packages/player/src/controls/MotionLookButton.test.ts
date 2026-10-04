import { DEFAULT_VIEW_MODE, TypedEmitter, type ViewMode } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { MotionLookButton, type MotionLookPlayer } from './MotionLookButton';
import { BrowserAttitudeSensor } from '../composition/BrowserAttitudeSensor';
import { browserPorts } from '../composition/browserPorts';
import { buildPipeline } from '../composition/buildPipeline';
import { Player } from '../player/Player';
import type { MotionLookState, PlayerEvents } from '../player/PlayerEvents';
import { removeRenderedControls, renderControls } from '../test/controls';
import { waitFor } from '../test/waiting';

/**
 * Motion look as a player keeps it, announcing every change as the real one does.
 */
class FakeMotionPlayer implements MotionLookPlayer {
  public readonly events = new TypedEmitter<PlayerEvents>();
  public motionLook: MotionLookState = 'off';
  public viewMode: ViewMode = 'normal';
  public starts = 0;

  public startMotionLook(): Promise<MotionLookState> {
    this.starts += 1;
    this.change('on');
    return Promise.resolve(this.motionLook);
  }

  public stopMotionLook(): void {
    this.change('off');
  }

  public change(state: MotionLookState): void {
    this.motionLook = state;
    this.events.emit('motionlookchange', state);
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.events.emit('viewmodechange', mode);
  }
}

function bound(player: MotionLookPlayer): HTMLButtonElement {
  const { parts } = renderControls();
  new MotionLookButton(parts, player);
  return parts.motionLook;
}

afterEach(() => {
  removeRenderedControls();
});

describe('MotionLookButton', () => {
  it('shows in the normal view where the device reports its attitude, and nowhere else', () => {
    const player = new FakeMotionPlayer();
    const button = bound(player);
    expect(button.hidden).toBe(false);
    player.setViewMode('equirectangular');
    expect(button.hidden).toBe(true);
    player.setViewMode('normal');
    player.change('unavailable');
    expect(button.hidden).toBe(true);
    player.viewMode = DEFAULT_VIEW_MODE;
    player.change('off');
    expect(button.hidden).toBe(true);
  });

  it('turns motion look on and off, pressed while it is on', () => {
    const player = new FakeMotionPlayer();
    const button = bound(player);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(player.starts).toBe(1);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(player.motionLook).toBe('off');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('is named for what it does, its state given by being pressed', () => {
    expect(bound(new FakeMotionPlayer()).getAttribute('aria-label')).toBe(
      'Look by moving the device',
    );
  });

  it('asks iOS for access within the press itself, as iOS asks only during a gesture', async () => {
    let wasAsked = false;
    const sensor = new BrowserAttitudeSensor({
      target: new EventTarget(),
      isSecureContext: true,
      orientationEvents: {
        requestPermission: (): Promise<string> => {
          wasAsked = true;
          return Promise.resolve('granted');
        },
      },
      touchPoints: 5,
      screenAngle: (): number => 0,
    });
    const host = {
      canvas: document.createElement('canvas'),
      audio: document.createElement('audio'),
    };
    const player = new Player({
      host,
      ports: browserPorts(),
      pipelines: buildPipeline,
      attitude: sensor,
    });
    player.setViewMode('normal');
    const button = bound(player);
    button.click();
    expect(wasAsked).toBe(true);
    await waitFor(() => player.motionLook === 'on', 'motion look to turn on');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    player.dispose();
  });
});
