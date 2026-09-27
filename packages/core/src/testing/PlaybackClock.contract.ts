import { describe, expect, it } from 'vitest';

import type { PlaybackClock } from '../ports/PlaybackClock';
import { seconds, type Seconds } from '../shared/units/time';

/**
 * A clock under test and a way to let time pass for it: real time for a real clock, a step of a
 * simulated one for a fake.
 */
export interface ClockUnderTest {
  readonly clock: PlaybackClock;
  readonly letTimePass: (elapsed: Seconds) => Promise<void>;
}

const A_WHILE = seconds(0.2);
/**
 * A clock driven by a media element moves in steps of its own; readings a few hundredths apart
 * are the same time.
 */
const SAME_TIME_TOLERANCE = 0.05;
const SEEK_TARGET = seconds(1);

/**
 * Where a clock that ends by itself runs out of media.
 */
export interface ClockEnding {
  readonly endsAt: Seconds;
}

/**
 * Behaviour every PlaybackClock must exhibit, the fake and the real adapters alike; `ending`
 * adds what a clock that runs out of media must do there.
 */
export function describePlaybackClockContract(
  open: () => Promise<ClockUnderTest>,
  ending?: ClockEnding,
): void {
  describe('PlaybackClock contract', () => {
    if (ending) describeEnding(open, ending);

    it('starts at zero, neither ended nor failed', async () => {
      const { clock } = await open();
      expect(clock.currentTime).toBe(0);
      expect(clock.hasEnded).toBe(false);
      expect(clock.failure).toBeUndefined();
    });

    it('holds its time until started', async () => {
      const { clock, letTimePass } = await open();
      await letTimePass(A_WHILE);
      expect(clock.currentTime).toBe(0);
    });

    it('runs from the call to start until a pause, and not before', async () => {
      const { clock } = await open();
      expect(clock.isRunning).toBe(false);
      const starting = clock.start();
      expect(clock.isRunning).toBe(true);
      await starting;
      expect(clock.isRunning).toBe(true);
      clock.pause();
      expect(clock.isRunning).toBe(false);
    });

    it('advances once started', async () => {
      const { clock, letTimePass } = await open();
      await clock.start();
      await letTimePass(A_WHILE);
      expect(clock.currentTime).toBeGreaterThan(0);
    });

    it('holds its time while paused', async () => {
      const { clock, letTimePass } = await open();
      await clock.start();
      await letTimePass(A_WHILE);
      clock.pause();
      const held = clock.currentTime;
      await letTimePass(A_WHILE);
      expect(Math.abs(clock.currentTime - held)).toBeLessThan(SAME_TIME_TOLERANCE);
    });

    it('seeks to a time', async () => {
      const { clock } = await open();
      clock.seek(SEEK_TARGET);
      expect(Math.abs(clock.currentTime - SEEK_TARGET)).toBeLessThan(SAME_TIME_TOLERANCE);
    });

    it('stops advancing once disposed', async () => {
      const { clock, letTimePass } = await open();
      await clock.start();
      await letTimePass(A_WHILE);
      clock.dispose();
      const last = clock.currentTime;
      await letTimePass(A_WHILE);
      expect(clock.currentTime).toBeLessThanOrEqual(last + SAME_TIME_TOLERANCE);
    });
  });
}

/**
 * A clock at its end stays there when started, as the port promises, until seeked away:
 * media elements restart an ended playback from the beginning instead.
 */
function describeEnding(open: () => Promise<ClockUnderTest>, ending: ClockEnding): void {
  it('stays at its end when started there, until seeked away', async () => {
    const { clock, letTimePass } = await open();
    clock.seek(ending.endsAt);
    // The session starts a clock it seeked a while ago, once the frames there are ready.
    await letTimePass(A_WHILE);
    await clock.start();
    await letTimePass(A_WHILE);
    expect(clock.hasEnded).toBe(true);
    expect(Math.abs(clock.currentTime - ending.endsAt)).toBeLessThan(SAME_TIME_TOLERANCE);
    clock.seek(seconds(0));
    expect(clock.hasEnded).toBe(false);
  });
}
