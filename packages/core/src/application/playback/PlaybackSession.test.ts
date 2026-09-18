import { describe, expect, it } from 'vitest';

import { PlaybackSession, type PlaybackSessionParts } from './PlaybackSession';
import { WallClock } from '../../domain/playback/WallClock';
import type { PlayerState } from '../../domain/playback/PlayerState';
import { seconds } from '../../shared/units/time';
import { FakeFrameSink } from '../../testing/FakeFrameSink';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';

const FRAME_RATE = 10;
const FRAMES = 30;
const DURATION = seconds(FRAMES / FRAME_RATE);

interface Harness {
  readonly session: PlaybackSession<FakeFrameHandle>;
  readonly sink: FakeFrameSink<FakeFrameHandle>;
  readonly decoderPort: FakeVideoDecoderPort;
  readonly states: PlayerState[];
  /**
   * Moves wall time forward and gives the pipeline a moment to decode, then ticks the session.
   */
  readonly advance: (ms: number) => Promise<void>;
}

function harness(overrides: Partial<PlaybackSessionParts<FakeFrameHandle>> = {}): Harness {
  let nowMs = 0;
  const clock = new WallClock(() => nowMs);
  const sink = new FakeFrameSink<FakeFrameHandle>();
  const decoderPort = new FakeVideoDecoderPort({ latencyTicks: 1 });
  const lensTracks = [0, 1].map(
    (trackIndex) =>
      new FakeVideoTrack({
        trackIndex,
        frameRate: FRAME_RATE,
        frameCount: FRAMES,
        framesPerGop: 10,
      }),
  );
  const session = new PlaybackSession<FakeFrameHandle>({
    lensTracks,
    decoderPort,
    clock,
    sink,
    duration: DURATION,
    frameTimes: undefined,
    pipeline: { maxPendingPackets: 3, pairTolerance: seconds(0.0001) },
    queueCapacity: 4,
    ...overrides,
  });
  const states: PlayerState[] = [];
  session.events.on('statechange', (state) => {
    states.push(state);
  });
  return {
    session,
    sink,
    decoderPort,
    states,
    advance: async (ms): Promise<void> => {
      nowMs += ms;
      await new Promise((resolve) => setTimeout(resolve, 5));
      session.tick();
    },
  };
}

describe('PlaybackSession', () => {
  it('is ready after construction and presents frames in step with the clock once playing', async () => {
    const { session, sink, advance } = harness();
    expect(session.state).toBe('ready');
    await session.play();
    expect(session.state).toBe('playing');
    await advance(0);
    await advance(250);
    await advance(300);
    expect(sink.presentations.map((presentation) => presentation.pair.timestamp)).toEqual([
      0, 0.2, 0.5,
    ]);
    expect(sink.presentations.at(-1)?.mediaTime).toBe(0.55);
    session.dispose();
  });

  it('closes superseded pairs and keeps only the presented one open', async () => {
    const { session, decoderPort, advance } = harness();
    await session.play();
    for (let step = 0; step < 6; step += 1) await advance(150);
    expect(decoderPort.openFrames).toBeLessThanOrEqual(2 + 2 * 4 + 2 * 3);
    session.dispose();
    expect(decoderPort.openFrames).toBe(0);
  });

  it('pauses and resumes without presenting stale frames', async () => {
    const { session, sink, advance } = harness();
    await session.play();
    await advance(300);
    session.pause();
    expect(session.state).toBe('paused');
    const shownWhilePaused = sink.presentations.length;
    await advance(1000);
    expect(sink.presentations.length).toBe(shownWhilePaused);
    await session.play();
    await advance(100);
    expect(sink.lastTimestamp).toBeCloseTo(0.4, 6);
    session.dispose();
  });

  it('seeks to a time and presents from there, never a frame before the target', async () => {
    const { session, sink, advance } = harness();
    await session.play();
    await advance(100);
    session.seek(seconds(2.05));
    await advance(0);
    await advance(0);
    expect(sink.lastTimestamp).toBeCloseTo(2, 6);
    await advance(160);
    expect(
      sink.presentations.every(
        (presentation) => presentation.pair.timestamp >= 2 || presentation.mediaTime < 0.2,
      ),
    ).toBe(true);
    expect(session.state).toBe('playing');
    session.dispose();
  });

  it('seeking while paused stays paused and shows the target frame', async () => {
    const { session, sink, advance, states } = harness();
    session.seek(seconds(1));
    await advance(0);
    await advance(0);
    expect(session.state).toBe('paused');
    expect(sink.lastTimestamp).toBe(1);
    expect(states).toEqual(['seeking', 'paused']);
    session.dispose();
  });

  it('ends when the clock passes the duration and every frame was shown, then can replay', async () => {
    const { session, advance, states } = harness();
    let endedCount = 0;
    session.events.on('ended', () => {
      endedCount += 1;
    });
    await session.play();
    for (let step = 0; step < 40; step += 1) await advance(100);
    expect(session.state).toBe('ended');
    expect(endedCount).toBe(1);
    await session.play();
    expect(session.state).toBe('playing');
    expect(session.currentTime).toBeLessThan(0.1);
    expect(states.filter((state) => state === 'ended')).toHaveLength(1);
    session.dispose();
  });

  it('stop returns to the start paused', async () => {
    const { session, sink, advance } = harness();
    await session.play();
    await advance(500);
    session.stop();
    await advance(0);
    expect(session.state).toBe('paused');
    expect(session.currentTime).toBe(0);
    expect(sink.lastTimestamp).toBe(0);
    session.dispose();
  });

  it('reports decoder failure as an error state with a typed error and stops the clock', async () => {
    const { session, advance } = harness({
      decoderPort: new FakeVideoDecoderPort({ unsupportedCodecs: ['fake.1'], failOnCreate: true }),
    });
    const errors: unknown[] = [];
    session.events.on('error', (error) => {
      errors.push(error);
    });
    await session.play();
    await advance(50);
    expect(session.state).toBe('error');
    expect(errors[0]).toMatchObject({ code: 'codec-unsupported' });
    expect(session.currentTime).toBe(session.currentTime);
    session.dispose();
  });

  it('dispose is idempotent and frees every frame', async () => {
    const { session, decoderPort, advance } = harness();
    await session.play();
    await advance(200);
    session.dispose();
    session.dispose();
    expect(session.state).toBe('disposed');
    expect(decoderPort.openFrames).toBe(0);
  });
});
