import { describe, expect, it } from 'vitest';

import { WallClock } from './WallClock';
import { describePlaybackClockContract } from '../../testing/PlaybackClock.contract';
import { milliseconds, seconds, secondsToMilliseconds } from '../../shared/units/time';

function clockAt(): { clock: WallClock; advance: (ms: number) => void } {
  let nowMs = 1000;
  const clock = new WallClock(() => milliseconds(nowMs));
  return {
    clock,
    advance: (ms: number): void => {
      nowMs += ms;
    },
  };
}

describePlaybackClockContract(() => {
  const { clock, advance } = clockAt();
  return Promise.resolve({
    clock,
    letTimePass: (elapsed) => {
      advance(secondsToMilliseconds(elapsed));
      return Promise.resolve();
    },
  });
});

describe('WallClock', () => {
  it('stands still until started and then advances with wall time', async () => {
    const { clock, advance } = clockAt();
    advance(500);
    expect(clock.currentTime).toBe(0);
    await clock.start();
    advance(1500);
    expect(clock.currentTime).toBe(1.5);
  });

  it('holds its position while stopped and resumes from it', async () => {
    const { clock, advance } = clockAt();
    await clock.start();
    advance(1000);
    clock.pause();
    advance(5000);
    expect(clock.currentTime).toBe(1);
    await clock.start();
    advance(250);
    expect(clock.currentTime).toBe(1.25);
  });

  it('seeks whether running or not', async () => {
    const { clock, advance } = clockAt();
    clock.seek(seconds(10));
    expect(clock.currentTime).toBe(10);
    await clock.start();
    advance(1000);
    clock.seek(seconds(2));
    advance(500);
    expect(clock.currentTime).toBe(2.5);
  });

  it('ignores a second start and a pause while already paused', async () => {
    let nowMs = 0;
    const clock = new WallClock(() => milliseconds(nowMs));
    await clock.start();
    nowMs = 1000;
    await clock.start();
    expect(clock.currentTime).toBe(1);
    clock.pause();
    clock.pause();
    nowMs = 5000;
    expect(clock.currentTime).toBe(1);
  });
});
