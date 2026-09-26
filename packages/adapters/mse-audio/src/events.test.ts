import { Signal } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { nextOfEvents } from './events';

/**
 * An event target that counts the listeners it holds.
 */
class CountingTarget extends EventTarget {
  public listeners = 0;

  public override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions,
  ): void {
    this.listeners += 1;
    options?.signal?.addEventListener('abort', () => {
      this.listeners -= 1;
    });
    super.addEventListener(type, callback, options);
  }
}

describe('nextOfEvents', () => {
  it('resolves with the first event and stops listening for the others', async () => {
    const target = new CountingTarget();
    const next = nextOfEvents(target, ['a', 'b']);
    target.dispatchEvent(new Event('b'));
    await expect(next).resolves.toBe('b');
    expect(target.listeners).toBe(0);
  });

  it('stops listening once told to, when another wait won the race', async () => {
    const target = new CountingTarget();
    const settled = new Signal();
    void nextOfEvents(target, ['a', 'b'], settled.promise);
    expect(target.listeners).toBe(2);
    settled.trigger();
    await settled.promise;
    expect(target.listeners).toBe(0);
  });
});
