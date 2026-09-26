import { describe, expect, it } from 'vitest';

import type { VideoDecoderConfiguration } from '../../ports/VideoTrack';
import type {
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { seconds } from '../../shared/units/time';
import { FakePlaybackClock } from '../../testing/FakePlaybackClock';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { DURATION, sessionHarness } from '../../../test/support/sessionHarness';
import { settle } from '../../../test/support/settle';

/**
 * A port whose decoders appear only when the test says so.
 */
class GatedPort implements VideoDecoderPort<FakeFrameHandle> {
  public readonly gate = new Deferred<void>();
  public readonly inner = new FakeVideoDecoderPort();

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return this.inner.isSupported(configuration);
  }

  public async create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<FakeFrameHandle>,
  ): Promise<VideoDecoderHandle> {
    await this.gate.promise;
    return this.inner.create(configuration, callbacks);
  }
}

describe('PlaybackSession lifecycle', () => {
  it('reports a decoder refused at creation as an error state with a typed error and a paused clock', async () => {
    const { session, clock, decoderPort, advance } = sessionHarness({
      decoder: { unsupportedCodecs: ['fake.1'], failOnCreate: true },
    });
    const errors: GyroViewError[] = [];
    session.events.on('error', (error) => {
      errors.push(error);
    });
    await session.play();
    await advance(50);
    expect(session.state).toBe('error');
    expect(errors[0]?.code).toBe('codec-unsupported');
    const held = clock.currentTime;
    await advance(500);
    expect(clock.currentTime).toBe(held);
    await settle();
    expect(decoderPort.openDecoders).toBe(0);
    session.dispose();
  });

  it('reports a decoder failing mid-stream, closing every frame and decoder', async () => {
    const { session, decoderPort, advance } = sessionHarness({ decoder: { failAtPacket: 8 } });
    const errors: GyroViewError[] = [];
    session.events.on('error', (error) => {
      errors.push(error);
    });
    await session.play();
    for (let step = 0; step < 6; step += 1) await advance(100);
    expect(session.state).toBe('error');
    expect(errors[0]?.code).toBe('decode');
    expect(errors[0]?.message).toContain('packet 8');
    await settle();
    expect(decoderPort.openDecoders).toBe(0);
    session.dispose();
    expect(decoderPort.openFrames).toBe(0);
  });

  it('falls back to paused, keeping the pipeline, when the clock refuses to start', async () => {
    const refusal = new GyroViewError('playback-blocked', 'no gesture yet');
    const clock = new FakePlaybackClock({ refusesToStartWith: refusal });
    const { session, decoderPort, states, advance } = sessionHarness({ clock });
    await expect(session.play()).rejects.toBe(refusal);
    expect(session.state).toBe('paused');
    expect(states).toEqual(['buffering', 'playing', 'paused']);
    await advance(0);
    expect(decoderPort.openDecoders).toBe(2);
    session.dispose();
  });

  it('ends at once after a seek to the end while playing, and starts over on the next play', async () => {
    const clock = new FakePlaybackClock({ endsAt: DURATION });
    const { session, advance } = sessionHarness({ clock });
    await session.play();
    await advance(100);
    session.seek(DURATION);
    for (let step = 0; step < 5; step += 1) await advance(0);
    expect(session.state).toBe('ended');
    await session.play();
    expect(session.currentTime).toBeLessThan(0.1);
    session.dispose();
  });

  it('starts over from a pause at the end', async () => {
    const clock = new FakePlaybackClock({ endsAt: DURATION });
    const { session, advance } = sessionHarness({ clock });
    session.seek(DURATION);
    await advance(0);
    expect(session.state).toBe('paused');
    const playing = session.play();
    for (let step = 0; step < 3; step += 1) await advance(0);
    await playing;
    expect(session.state).toBe('playing');
    expect(session.currentTime).toBeLessThan(0.1);
    session.dispose();
  });

  it('ends when the clock runs out long before the decoders reach the end', async () => {
    const clock = new FakePlaybackClock({ endsAt: seconds(1.5) });
    const { session, sink, advance } = sessionHarness({ clock });
    await session.play();
    for (let step = 0; step < 25; step += 1) await advance(100);
    expect(session.state).toBe('ended');
    expect(sink.lastTimestamp).toBeCloseTo(1.5, 6);
    session.dispose();
  });

  it('starts again at the clock after ticks stopped for a while, instead of replaying the gap', async () => {
    const { session, sink, advance } = sessionHarness();
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
    session.dispose();
  });

  it('ends when the clock runs out before the duration, as an audio track shorter than the video does', async () => {
    const clock = new FakePlaybackClock({ endsAt: seconds(2.85) });
    const { session, sink, advance } = sessionHarness({ clock });
    await session.play();
    for (let step = 0; step < 40; step += 1) await advance(100);
    expect(session.state).toBe('ended');
    expect(sink.lastTimestamp).toBeCloseTo(2.8, 6);
    session.dispose();
  });

  it('turns a clock failure into the error state on the next tick', async () => {
    const clock = new FakePlaybackClock();
    const { session, advance } = sessionHarness({ clock });
    const errors: GyroViewError[] = [];
    session.events.on('error', (error) => {
      errors.push(error);
    });
    await session.play();
    await advance(100);
    clock.failure = new GyroViewError('source-unreadable', 'audio range request failed');
    await advance(100);
    expect(session.state).toBe('error');
    expect(errors[0]?.code).toBe('source-unreadable');
    session.dispose();
  });

  it('survives pause and resume cycles without opening new decoders or leaking frames', async () => {
    const { session, decoderPort, advance } = sessionHarness();
    await session.play();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await advance(150);
      session.pause();
      await advance(50);
      await session.play();
    }
    expect(decoderPort.decodersCreated).toHaveLength(2);
    session.dispose();
    await settle();
    expect(decoderPort.openDecoders).toBe(0);
    expect(decoderPort.openFrames).toBe(0);
  });

  it('closes decoders that appear only after it was disposed', async () => {
    const port = new GatedPort();
    const { session } = sessionHarness({ parts: { decoderPort: port } });
    const playing = session.play();
    session.dispose();
    await playing;
    port.gate.resolve();
    await settle();
    expect(port.inner.decodersCreated).toHaveLength(2);
    expect(port.inner.openDecoders).toBe(0);
  });

  it('dispose is idempotent, frees every frame, pauses the clock and stops notifying', async () => {
    const { session, decoderPort, clock, states, advance } = sessionHarness();
    await session.play();
    await advance(200);
    session.dispose();
    session.dispose();
    await settle();
    expect(session.state).toBe('disposed');
    expect(states.at(-1)).toBe('disposed');
    expect(states.filter((state) => state === 'disposed')).toHaveLength(1);
    const held = clock.currentTime;
    await advance(300);
    expect(clock.currentTime).toBe(held);
    expect(decoderPort.openFrames).toBe(0);
    expect(decoderPort.openDecoders).toBe(0);
    session.seek(seconds(1));
    session.tick();
    await expect(session.play()).resolves.toBeUndefined();
    expect(session.state).toBe('disposed');
  });
});
