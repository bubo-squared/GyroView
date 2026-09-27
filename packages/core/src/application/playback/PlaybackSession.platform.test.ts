import { describe, expect, it } from 'vitest';

import { seconds } from '../../shared/units/time';
import { FakePlaybackClock } from '../../testing/FakePlaybackClock';
import { DURATION, sessionHarness } from '../../../test/support/sessionHarness';

describe('PlaybackSession following what the platform does to its clock', () => {
  it('pauses with a clock the platform stopped by itself, and plays again on request', async () => {
    const clock = new FakePlaybackClock();
    const { session, states, advance } = sessionHarness({ clock });
    const updates: number[] = [];
    session.events.on('timeupdate', (time) => {
      updates.push(time);
    });
    await session.play();
    await advance(0);

    await advance(100);
    clock.pause();
    await advance(30);

    expect(session.state).toBe('paused');
    expect(states.at(-1)).toBe('paused');
    expect(updates.at(-1)).toBeCloseTo(clock.currentTime, 6);
    await session.play();
    expect(clock.isRunning).toBe(true);
    session.dispose();
  });

  it('follows a start the platform made by itself, as a media key does', async () => {
    const clock = new FakePlaybackClock();
    const { session, advance } = sessionHarness({ clock });
    await session.play();
    await advance(100);
    session.pause();
    await clock.start();
    for (let step = 0; step < 3; step += 1) await advance(0);
    expect(session.state).toBe('playing');
    session.dispose();
  });

  describe('when the platform moves the clock by itself (a lock screen scrubber)', () => {
    it('decodes anew from where it moved a playing clock back, buffering meanwhile', async () => {
      const clock = new FakePlaybackClock();
      const { session, sink, advance } = sessionHarness({ clock });
      await session.play();
      for (let step = 0; step < 10; step += 1) await advance(100);
      clock.seek(seconds(0.3));
      session.tick();
      expect(session.state).toBe('buffering');
      expect(clock.isRunning).toBe(false);
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('playing');
      expect(sink.lastTimestamp).toBeCloseTo(0.3, 6);
      session.dispose();
    });

    it('stays paused where it moved a playing clock it also stopped', async () => {
      const clock = new FakePlaybackClock();
      const { session, sink, advance } = sessionHarness({ clock });
      await session.play();
      for (let step = 0; step < 10; step += 1) await advance(100);
      clock.pause();
      clock.seek(seconds(0.3));
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('paused');
      expect(clock.isRunning).toBe(false);
      expect(sink.lastTimestamp).toBeCloseTo(0.3, 6);
      session.dispose();
    });

    it('leaves the end for where it moved the clock, and plays on from there', async () => {
      const clock = new FakePlaybackClock();
      const { session, advance } = sessionHarness({ clock });
      await session.play();
      for (let step = 0; step < 40 && session.state !== 'ended'; step += 1) await advance(100);
      expect(session.state).toBe('ended');
      clock.seek(seconds(1.5));
      await advance(0);
      expect(session.state).toBe('paused');
      await session.play();
      expect(session.currentTime).toBeCloseTo(1.5, 6);
      session.dispose();
    });

    it('shows the frame where it moved a paused clock, and announces the time there', async () => {
      const clock = new FakePlaybackClock();
      const { session, sink, advance } = sessionHarness({ clock });
      await session.play();
      await advance(100);
      session.pause();
      const updates: number[] = [];
      session.events.on('timeupdate', (time) => {
        updates.push(time);
      });
      clock.seek(seconds(2));
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('paused');
      expect(sink.lastTimestamp).toBeCloseTo(2, 6);
      expect(updates).toEqual([2]);
      session.dispose();
    });

    it('plays from where it started a clock it moved away from the end', async () => {
      const clock = new FakePlaybackClock();
      const { session, sink, advance } = sessionHarness({ clock });
      session.seek(DURATION);
      for (let step = 0; step < 3; step += 1) await advance(0);
      clock.seek(seconds(0));
      await clock.start();
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('playing');
      expect(sink.lastTimestamp).toBeCloseTo(0, 6);
      session.dispose();
    });
  });

  describe('when the ticks stop while the clock runs on (a hidden tab, an offscreen frame)', () => {
    it('starts again at the clock after ticks stopped for a while, instead of replaying the gap', async () => {
      const { session, sink, advance, states } = sessionHarness();
      await session.play();
      await advance(100);
      // A hidden tab: no ticks for two seconds while the clock runs on. The tick that finds the
      // gap shows what it has queued once, then decoding starts again at the clock.
      await advance(2000);
      for (let step = 0; step < 4; step += 1) await advance(0);
      expect(session.state).toBe('playing');
      const replayed = sink.presentations.filter(
        ({ pair }) => pair.timestamp > 1 && pair.timestamp < 2,
      );
      expect(replayed).toEqual([]);
      expect(sink.lastTimestamp).toBeGreaterThanOrEqual(2);
      // Not a seek a page would take for the viewer's.
      expect(states).not.toContain('seeking');
      session.dispose();
    });

    it('ends when the clock ran out meanwhile, despite the stale pairs left queued', async () => {
      const clock = new FakePlaybackClock({ endsAt: DURATION });
      const { session, advance } = sessionHarness({ clock });
      await session.play();
      await advance(100);
      clock.advance(DURATION);
      session.tick();
      expect(session.state).toBe('ended');
      session.dispose();
    });

    it('notices the missed ticks when playback started without any', async () => {
      const clock = new FakePlaybackClock();
      const { session, sink, states, advance } = sessionHarness({ clock });
      session.preload();
      for (let step = 0; step < 3; step += 1) await advance(0);
      await session.play();
      clock.advance(seconds(2));
      session.tick();
      expect(session.state).toBe('buffering');
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('playing');
      expect(sink.lastTimestamp).toBeGreaterThanOrEqual(2);
      expect(states).not.toContain('seeking');
      session.dispose();
    });

    it('stays paused when the platform paused the clock meanwhile', async () => {
      const clock = new FakePlaybackClock();
      const { session, advance } = sessionHarness({ clock });
      await session.play();
      await advance(100);
      clock.advance(seconds(2));
      clock.pause();
      session.tick();
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('paused');
      expect(clock.isRunning).toBe(false);
      session.dispose();
    });

    it('ends at the duration on a clock that never ends by itself', async () => {
      const { session, advance } = sessionHarness();
      await session.play();
      await advance(100);
      await advance(5000);
      expect(session.state).toBe('ended');
      expect(session.currentTime).toBe(DURATION);
      session.dispose();
    });
  });
});
