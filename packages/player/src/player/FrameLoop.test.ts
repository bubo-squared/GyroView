import { describe, expect, it } from 'vitest';

import { FrameLoop } from './FrameLoop';
import { ManualScheduler } from '../test/animationFrames';

describe('FrameLoop', () => {
  it('ticks once per frame while running and reschedules itself', () => {
    const scheduler = new ManualScheduler();
    let ticks = 0;
    const loop = new FrameLoop(() => {
      ticks += 1;
    }, scheduler);

    loop.start();
    loop.start();
    expect(scheduler.pendingCount).toBe(1);
    scheduler.fire();
    scheduler.fire();

    expect(ticks).toBe(2);
    expect(scheduler.pendingCount).toBe(1);
  });

  it('stops cleanly, leaving no frame requested, and can start again', () => {
    const scheduler = new ManualScheduler();
    let ticks = 0;
    const loop = new FrameLoop(() => {
      ticks += 1;
    }, scheduler);

    loop.start();
    loop.stop();
    expect(scheduler.pendingCount).toBe(0);
    scheduler.fire();
    expect(ticks).toBe(0);

    loop.start();
    scheduler.fire();
    expect(ticks).toBe(1);
  });

  it('honours a stop issued from inside the tick', () => {
    const scheduler = new ManualScheduler();
    const loop = new FrameLoop(() => {
      loop.stop();
    }, scheduler);
    loop.start();
    scheduler.fire();
    expect(scheduler.pendingCount).toBe(0);
  });
});
