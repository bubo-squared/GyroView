import type { DragDelta, ScreenPoint } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { attachKeyboard, attachViewGestures } from './customControls';

/**
 * The player as a page's own interface drives it, recording what it was asked.
 */
class FakePlayer {
  public readonly calls: string[] = [];
  public readonly canPan = true;
  public currentTime = 10;
  public isMuted = false;

  public pan(delta: DragDelta): void {
    this.calls.push(`pan ${delta.x},${delta.y}`);
  }

  public zoom(steps: number, focus?: ScreenPoint): void {
    this.calls.push(`zoom ${steps}${focus ? ` at ${focus.x.toFixed(1)}` : ''}`);
  }

  public togglePlayback(): void {
    this.calls.push('toggle playback');
  }

  public seek(time: number): void {
    this.calls.push(`seek ${time}`);
  }

  public stop(): void {
    this.calls.push('stop');
  }

  public turn(yaw: number, pitch: number): void {
    this.calls.push(`turn ${yaw},${pitch}`);
  }

  public resetView(): void {
    this.calls.push('reset view');
  }

  public setMuted(isMuted: boolean): void {
    this.isMuted = isMuted;
    this.calls.push(`muted ${String(isMuted)}`);
  }
}

const surfaces: HTMLElement[] = [];

function surface(): HTMLElement {
  const element = document.createElement('div');
  element.style.cssText = 'position: fixed; left: 0; top: 0; width: 200px; height: 100px';
  element.tabIndex = 0;
  document.body.append(element);
  surfaces.push(element);
  return element;
}

function pointer(type: string, x: number): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientX: x, clientY: 50, bubbles: true });
}

function key(target: HTMLElement, name: string, isShiftPressed = false): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, shiftKey: isShiftPressed, bubbles: true }),
  );
}

describe('attachViewGestures', () => {
  afterEach(() => {
    for (const element of surfaces.splice(0)) element.remove();
  });

  it('looks around on a drag, zooms toward the wheel, toggles playback on a tap, and stops once detached', () => {
    const [target, player] = [surface(), new FakePlayer()];
    const detach = attachViewGestures(target, player);

    target.dispatchEvent(pointer('pointerdown', 50));
    target.dispatchEvent(pointer('pointermove', 70));
    target.dispatchEvent(pointer('pointerup', 70));
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 150, clientY: 50 }));
    target.dispatchEvent(pointer('pointerdown', 100));
    target.dispatchEvent(pointer('pointerup', 100));
    detach();
    target.dispatchEvent(pointer('pointerdown', 50));
    target.dispatchEvent(pointer('pointermove', 90));

    expect(player.calls).toEqual(['pan 20,0', 'zoom 1 at 0.8', 'toggle playback']);
  });

  it('hands a tap to the page when it asks for them', () => {
    const [target, player] = [surface(), new FakePlayer()];
    const taps: string[] = [];
    attachViewGestures(target, player, {
      onTap: (pointerType): void => {
        taps.push(pointerType);
      },
    });
    target.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'pen', bubbles: true }),
    );
    target.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, pointerType: 'pen', bubbles: true }),
    );
    expect(taps).toEqual(['pen']);
    expect(player.calls).toEqual([]);
  });
});

describe('attachKeyboard', () => {
  afterEach(() => {
    for (const element of surfaces.splice(0)) element.remove();
  });

  it('answers the element shortcuts until detached', () => {
    const [target, player] = [surface(), new FakePlayer()];
    const detach = attachKeyboard(target, player);
    for (const name of ['k', 'l', 'ArrowLeft', 'm', '0', 's']) key(target, name);
    key(target, 'ArrowRight', true);
    detach();
    key(target, 'k');
    expect(player.calls).toEqual([
      'toggle playback',
      'seek 15',
      'turn -5,0',
      'muted true',
      'reset view',
      'stop',
      'seek 15',
    ]);
  });

  it('fills the screen as the page says when it gives its own way', () => {
    const [target, player] = [surface(), new FakePlayer()];
    attachKeyboard(target, player, {
      toggleFullscreen: (): void => {
        player.calls.push('fullscreen');
      },
    });
    key(target, 'f');
    expect(player.calls).toEqual(['fullscreen']);
  });
});
