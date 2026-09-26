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

const A_WHILE = seconds(0.4);
/**
 * A clock driven by a media element moves in steps of its own; readings a few hundredths apart
 * are the same time.
 */
const SAME_TIME_TOLERANCE = 0.05;
const SEEK_TARGET = seconds(1);

/**
 * Behaviour every PlaybackClock must exhibit, the fake and the real adapters alike.
 */
export function describePlaybackClockContract(open: () => Promise<ClockUnderTest>): void {
  describe('PlaybackClock contract', () => {
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

    it('runs from a start until a pause, and not before', async () => {
      const { clock } = await open();
      expect(clock.isRunning).toBe(false);
      await clock.start();
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
