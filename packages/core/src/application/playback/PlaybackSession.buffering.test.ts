import { describe, expect, it } from 'vitest';

import { seconds } from '../../shared/units/time';
import { FakePlaybackClock } from '../../testing/FakePlaybackClock';
import { sessionHarness, settle } from '../../../test/support/sessionHarness';

describe('PlaybackSession buffering', () => {
  it('waits in buffering for the first pairs and starts the clock only then', async () => {
    const clock = new FakePlaybackClock();
    const { session, states } = sessionHarness({ clock });

    const playing = session.play();
    expect(session.state).toBe('buffering');
    expect(clock.isRunning).toBe(false);
    // A second call joins the first instead of resolving before the clock runs.
    const joining = session.play();

    await Promise.all([playing, joining]);
    expect(session.state).toBe('playing');
    expect(clock.isRunning).toBe(true);
    expect(states).toEqual(['buffering', 'playing']);
    session.dispose();
  });

  it('shows the first frame while still ready when preloaded, and then plays at once', async () => {
    const { session, sink, states, advance } = sessionHarness();
    session.preload();
    await advance(0);
    expect(session.state).toBe('ready');
    expect(sink.lastTimestamp).toBe(0);

    await session.play();
    expect(states).toEqual(['playing']);
    session.dispose();
  });

  it('pauses the clock and buffers when the decoders fall behind, resuming once they catch up', async () => {
    const clock = new FakePlaybackClock();
    const { session, sink, states, advance } = sessionHarness({ clock });
    await session.play();
    await advance(0);
    expect(sink.lastTimestamp).toBe(0);

    // Two big jumps without letting the decoders work: the second finds nothing to show.
    clock.advance(seconds(1));
    session.tick();
    expect(session.state).toBe('playing');
    clock.advance(seconds(1));
    session.tick();
    expect(session.state).toBe('buffering');
    expect(clock.isRunning).toBe(false);

    await settle();
    expect(session.state).toBe('playing');
    expect(clock.isRunning).toBe(true);
    expect(states).toEqual(['buffering', 'playing', 'buffering', 'playing']);
    session.dispose();
  });

  it('does not buffer for a frame that is merely not due yet', async () => {
    const clock = new FakePlaybackClock();
    const { session, advance } = sessionHarness({ clock });
    await session.play();
    await advance(0);
    for (let step = 0; step < 5; step += 1) await advance(30);
    expect(session.state).toBe('playing');
    session.dispose();
  });

  it('resumes through buffering after a seek while playing, holding the clock at the target', async () => {
    const clock = new FakePlaybackClock();
    const { session, states, advance } = sessionHarness({ clock });
    await session.play();
    await advance(100);

    session.seek(seconds(2));
    expect(session.state).toBe('buffering');
    expect(clock.isRunning).toBe(false);
    expect(clock.currentTime).toBe(2);

    await settle();
    expect(session.state).toBe('playing');
    expect(clock.isRunning).toBe(true);
    expect(states).toEqual(['buffering', 'playing', 'seeking', 'buffering', 'playing']);
    session.dispose();
  });

  it('lets pause settle a play that is still buffering', async () => {
    const clock = new FakePlaybackClock();
    const { session, states } = sessionHarness({ clock, decoder: { latencyTicks: 50 } });
    const playing = session.play();
    session.pause();
    await playing;
    expect(session.state).toBe('paused');
    expect(clock.isRunning).toBe(false);
    await settle();
    expect(states).toEqual(['buffering', 'paused']);
    session.dispose();
  });

  it('scrubs to the key frame at or before the time, playing or paused', async () => {
    const { session, sink, advance } = sessionHarness();
    await session.play();
    await advance(100);

    await session.scrub(seconds(1.55));
    await advance(0);
    expect(sink.lastTimestamp).toBe(1);
    expect(session.currentTime).toBe(1);

    session.pause();
    await session.scrub(seconds(2.9));
    await advance(0);
    expect(sink.lastTimestamp).toBe(2);
    expect(session.state).toBe('paused');
    session.dispose();
  });

  it('pauses with a clock the platform stopped by itself, and plays again on request', async () => {
    const clock = new FakePlaybackClock();
    const { session, states, advance } = sessionHarness({ clock });
    await session.play();
    await advance(0);

    clock.pause();
    await advance(30);

    expect(session.state).toBe('paused');
    expect(states.at(-1)).toBe('paused');
    await session.play();
    expect(clock.isRunning).toBe(true);
    session.dispose();
  });
});
