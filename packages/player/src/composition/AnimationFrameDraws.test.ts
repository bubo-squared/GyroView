import { describe, expect, it } from 'vitest';

import { AnimationFrameDraws } from './AnimationFrameDraws';
import { ManualScheduler } from '../test/animationFrames';

function counter(): { readonly draw: () => void; readonly count: () => number } {
  let draws = 0;
  return {
    draw: (): void => {
      draws += 1;
    },
    count: (): number => draws,
  };
}

describe('AnimationFrameDraws', () => {
  it('draws once at the next animation frame for every request before it', () => {
    const frames = new ManualScheduler();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.request(draw);
    schedule.request(draw);
    expect(count()).toBe(0);
    expect(frames.pendingCount).toBe(1);
    frames.fire();
    expect(count()).toBe(1);
  });

  it('draws what the latest request asked for', () => {
    const frames = new ManualScheduler();
    const schedule = new AnimationFrameDraws(frames);
    const first = counter();
    const latest = counter();
    schedule.request(first.draw);
    schedule.request(latest.draw);
    frames.fire();
    expect(first.count()).toBe(0);
    expect(latest.count()).toBe(1);
  });

  it('asks for another frame for a request after the draw', () => {
    const frames = new ManualScheduler();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    frames.fire();
    schedule.request(draw);
    frames.fire();
    expect(count()).toBe(2);
  });

  it('draws nothing once cancelled, and gives the frame it asked for back', () => {
    const frames = new ManualScheduler();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.cancel();
    expect(frames.pendingCount).toBe(0);
    frames.fire();
    expect(count()).toBe(0);
  });

  it('serves a request after a cancel at the next frame', () => {
    const frames = new ManualScheduler();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.cancel();
    schedule.request(draw);
    frames.fire();
    expect(count()).toBe(1);
  });

  it('runs on the browser’s animation frames when given none', async () => {
    const schedule = new AnimationFrameDraws();
    const drawn = new Promise<void>((resolve) => {
      schedule.request(resolve);
    });
    await expect(drawn).resolves.toBeUndefined();
  });
});
