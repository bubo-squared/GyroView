import { describe, expect, it } from 'vitest';

import type { PlaybackSession } from './PlaybackSession';
import type { PlayerState } from '../../domain/playback/PlayerState';
import { seconds } from '../../shared/units/time';
import { FakePlaybackClock } from '../../testing/FakePlaybackClock';
import type { FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { sessionHarness } from '../../../test/support/sessionHarness';

type Session = PlaybackSession<FakeFrameHandle>;

function onFirst(session: Session, state: PlayerState, action: () => void): void {
  const unsubscribe = session.events.on('statechange', (next) => {
    if (next !== state) return;
    unsubscribe();
    action();
  });
}

function timeUpdatesOf(session: Session): number[] {
  const updates: number[] = [];
  session.events.on('timeupdate', (time) => {
    updates.push(time);
  });
  return updates;
}

describe('PlaybackSession with listeners that act on what it announces', () => {
  describe('with a listener that pauses as the session announces a change', () => {
    it('keeps the clock stopped when paused on playing', async () => {
      const clock = new FakePlaybackClock();
      const { session, advance } = sessionHarness({ clock });
      session.preload();
      for (let step = 0; step < 3; step += 1) await advance(0);
      session.events.on('statechange', (state) => {
        if (state === 'playing') session.pause();
      });
      await session.play();
      expect(session.state).toBe('paused');
      expect(clock.isRunning).toBe(false);
      session.dispose();
    });

    it('settles the play when paused on buffering', async () => {
      const { session } = sessionHarness();
      session.events.on('statechange', (state) => {
        if (state === 'buffering') session.pause();
      });
      await session.play();
      expect(session.state).toBe('paused');
      session.dispose();
    });

    it('settles the play it paused and leaves a play made on paused to start the clock', async () => {
      const { session, advance } = sessionHarness();
      const plays: Promise<void>[] = [];
      const firstPlay = session.play();
      onFirst(session, 'paused', () => {
        plays.push(session.play());
      });
      session.pause();
      await firstPlay;
      expect(session.state).toBe('buffering');
      for (let step = 0; step < 3; step += 1) await advance(0);
      await Promise.all(plays);
      expect(session.state).toBe('playing');
      session.dispose();
    });

    it('stays paused when paused on seeking', async () => {
      const { session, advance } = sessionHarness();
      await session.play();
      await advance(100);
      session.events.on('statechange', (state) => {
        if (state === 'seeking') session.pause();
      });
      session.seek(seconds(2));
      expect(session.state).toBe('paused');
      session.dispose();
    });
  });

  it('announces no end once a listener started over on ended', async () => {
    const { session, states, advance } = sessionHarness();
    const ends: string[] = [];
    session.events.on('ended', () => {
      ends.push('ended');
    });
    onFirst(session, 'ended', () => {
      void session.play();
    });
    await session.play();
    for (let step = 0; step < 40 && !states.includes('ended'); step += 1) await advance(100);
    await advance(0);
    expect(states).toContain('ended');
    expect(ends).toEqual([]);
    expect(session.state).not.toBe('ended');
    session.dispose();
  });

  describe('with a listener that seeks as the session announces a change', () => {
    it('lands where a seek made on seeking asked, and plays on from there', async () => {
      const { session, sink, advance } = sessionHarness();
      await session.play();
      await advance(100);
      const updates = timeUpdatesOf(session);
      onFirst(session, 'seeking', () => {
        session.seek(seconds(2.5));
      });
      session.seek(seconds(1));
      expect(session.state).toBe('buffering');
      expect(session.currentTime).toBe(2.5);
      expect(updates).toEqual([2.5]);
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('playing');
      expect(sink.lastTimestamp).toBeCloseTo(2.5, 6);
      session.dispose();
    });

    it('stays at the start, showing it, when stopped on seeking', async () => {
      const { session, sink, advance } = sessionHarness();
      await session.play();
      await advance(100);
      const updates = timeUpdatesOf(session);
      onFirst(session, 'seeking', () => {
        session.stop();
      });
      session.seek(seconds(2));
      for (let step = 0; step < 3; step += 1) await advance(0);
      expect(session.state).toBe('paused');
      expect(session.currentTime).toBe(0);
      expect(sink.lastTimestamp).toBe(0);
      expect(updates.at(-1)).toBe(0);
      session.dispose();
    });

    it('announces no time of a seek that one made on its landing overtook', () => {
      const { session } = sessionHarness();
      const updates = timeUpdatesOf(session);
      onFirst(session, 'paused', () => {
        session.seek(seconds(2.5));
      });
      session.seek(seconds(1));
      expect(session.currentTime).toBe(2.5);
      expect(updates).toEqual([2.5]);
      session.dispose();
    });
  });

  it('announces seeking at the time sought', () => {
    const { session } = sessionHarness();
    const timesSeeking: number[] = [];
    session.events.on('statechange', (state) => {
      if (state === 'seeking') timesSeeking.push(session.currentTime);
    });
    session.seek(seconds(2));
    expect(timesSeeking).toEqual([2]);
    session.dispose();
  });
});
