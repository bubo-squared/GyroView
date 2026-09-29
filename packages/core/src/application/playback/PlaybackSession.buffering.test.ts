import { describe, expect, it } from 'vitest';

import { Deferred } from '../../shared/async/Deferred';
import { seconds } from '../../shared/units/time';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { FakePlaybackClock } from '../../testing/FakePlaybackClock';
import { sessionHarness } from '../../../test/support/sessionHarness';
import { settle } from '../../../test/support/settle';

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

    // A jump the decoders have not kept up with: the tick shows what is queued, still well
    // behind the clock with nothing more to come yet.
    clock.advance(seconds(0.8));
    session.tick();
    expect(sink.lastTimestamp).toBeLessThan(0.6);
    expect(session.state).toBe('buffering');
    expect(clock.isRunning).toBe(false);

    await settle();
    expect(session.state).toBe('playing');
    expect(clock.isRunning).toBe(true);
    expect(states).toEqual(['buffering', 'playing', 'buffering', 'playing']);
    session.dispose();
  });

  it('resumes only once decoding has caught up with the clock, instead of flapping', async () => {
    const clock = new FakePlaybackClock();
    const { session, sink, states, advance } = sessionHarness({ clock });
    await session.play();
    await advance(0);
    // Further than a full queue reaches, yet short of what counts as missed ticks.
    clock.advance(seconds(0.95));
    session.tick();
    expect(session.state).toBe('buffering');

    // The queue fills with pairs the clock has passed: no start on those.
    await settle();
    expect(session.state).toBe('buffering');
    for (let step = 0; step < 6; step += 1) await advance(0);
    expect(session.state).toBe('playing');
    expect(sink.lastTimestamp).toBeCloseTo(0.9, 6);
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

  it('lets a scrub whose key frame could not be looked up go quietly once disposed', async () => {
    const lookup = new Deferred<void>();
    class LetGoTrack extends FakeVideoTrack {
      public override async keyframeAt(): Promise<undefined> {
        await lookup.promise;
        return undefined;
      }
    }
    const frameSources = [0, 1].map(
      (trackIndex) =>
        new LetGoTrack({ trackIndex, frameRate: 10, frameCount: 30, framesPerGop: 10 }),
    );
    const { session } = sessionHarness({ parts: { frameSources } });
    const scrubbing = session.scrub(seconds(1.5));
    session.dispose();
    lookup.reject(new Error('input disposed'));
    await expect(scrubbing).resolves.toBeUndefined();
  });

  it('lands the newest of overlapping scrubs', async () => {
    const { session } = sessionHarness();
    await Promise.all([session.scrub(seconds(1.5)), session.scrub(seconds(2.5))]);
    expect(session.currentTime).toBe(2);
    session.dispose();
  });

  it('lets a seek made while a scrub looks for its key frame win', async () => {
    const { session } = sessionHarness();
    const scrubbing = session.scrub(seconds(1.5));
    session.seek(seconds(2.5));
    await scrubbing;
    expect(session.currentTime).toBe(2.5);
    session.dispose();
  });
});
