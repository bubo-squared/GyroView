import { describe, expect, it } from 'vitest';

import { AnimationFrameDraws, DRAW_AT_ONCE, type AnimationFrames } from './drawSchedules';

/**
 * Animation frames that come when the test says.
 */
class ManualFrames implements AnimationFrames {
  private readonly callbacks = new Map<number, () => void>();
  private nextHandle = 1;

  public get requested(): number {
    return this.callbacks.size;
  }

  public request(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  public cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  public runFrame(): void {
    const due = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of due) callback();
  }
}

function counter(): { readonly draw: () => void; readonly count: () => number } {
  let draws = 0;
  return {
    draw: (): void => {
      draws += 1;
    },
    count: (): number => draws,
  };
}

describe('DRAW_AT_ONCE', () => {
  it('draws each request at once', () => {
    const { draw, count } = counter();
    DRAW_AT_ONCE.request(draw);
    DRAW_AT_ONCE.request(draw);
    expect(count()).toBe(2);
  });
});

describe('AnimationFrameDraws', () => {
  it('draws once at the next animation frame for every request before it', () => {
    const frames = new ManualFrames();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.request(draw);
    schedule.request(draw);
    expect(count()).toBe(0);
    expect(frames.requested).toBe(1);
    frames.runFrame();
    expect(count()).toBe(1);
  });

  it('draws what the latest request asked for', () => {
    const frames = new ManualFrames();
    const schedule = new AnimationFrameDraws(frames);
    const first = counter();
    const latest = counter();
    schedule.request(first.draw);
    schedule.request(latest.draw);
    frames.runFrame();
    expect(first.count()).toBe(0);
    expect(latest.count()).toBe(1);
  });

  it('asks for another frame for a request after the draw', () => {
    const frames = new ManualFrames();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    frames.runFrame();
    schedule.request(draw);
    frames.runFrame();
    expect(count()).toBe(2);
  });

  it('draws nothing once cancelled, and gives the frame it asked for back', () => {
    const frames = new ManualFrames();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.cancel();
    expect(frames.requested).toBe(0);
    frames.runFrame();
    expect(count()).toBe(0);
  });

  it('serves a request after a cancel at the next frame', () => {
    const frames = new ManualFrames();
    const schedule = new AnimationFrameDraws(frames);
    const { draw, count } = counter();
    schedule.request(draw);
    schedule.cancel();
    schedule.request(draw);
    frames.runFrame();
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
