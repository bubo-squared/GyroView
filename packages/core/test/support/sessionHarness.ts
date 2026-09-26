import {
  PlaybackSession,
  type PlaybackSessionParts,
} from '../../src/application/playback/PlaybackSession';
import type { PlayerState } from '../../src/domain/playback/PlayerState';
import { WallClock } from '../../src/application/playback/WallClock';
import type { PlaybackClock } from '../../src/ports/PlaybackClock';
import { milliseconds, seconds } from '../../src/shared/units/time';
import { FakeFrameSink } from '../../src/testing/FakeFrameSink';
import { FakePlaybackClock } from '../../src/testing/FakePlaybackClock';
import {
  FakeVideoDecoderPort,
  type FakeDecoderOptions,
  type FakeFrameHandle,
} from '../../src/testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../src/testing/FakeVideoTrack';

export const FRAME_RATE = 10;
const FRAMES = 30;
const FRAMES_PER_GOP = 10;
export const DURATION = seconds(FRAMES / FRAME_RATE);
const SETTLE_MS = 5;
const MILLISECONDS_PER_SECOND = 1000;

export interface SessionHarness {
  readonly session: PlaybackSession<FakeFrameHandle>;
  readonly sink: FakeFrameSink<FakeFrameHandle>;
  readonly decoderPort: FakeVideoDecoderPort;
  readonly clock: PlaybackClock;
  readonly states: PlayerState[];
  /**
   * Moves the clock forward by `ms`, lets the pipeline decode, then ticks the session.
   */
  readonly advance: (ms: number) => Promise<void>;
}

export interface SessionHarnessOptions {
  readonly decoder?: FakeDecoderOptions;
  /**
   * A controllable clock instead of the wall clock over fake time.
   */
  readonly clock?: FakePlaybackClock;
  readonly parts?: Partial<PlaybackSessionParts<FakeFrameHandle>>;
}

function frameSources(frameCount = FRAMES): FakeVideoTrack[] {
  return [0, 1].map(
    (trackIndex) =>
      new FakeVideoTrack({
        trackIndex,
        frameRate: FRAME_RATE,
        frameCount,
        framesPerGop: FRAMES_PER_GOP,
      }),
  );
}

export function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, SETTLE_MS);
  });
}

export function sessionHarness(options: SessionHarnessOptions = {}): SessionHarness {
  let nowMs = 0;
  const clock: PlaybackClock = options.clock ?? new WallClock(() => milliseconds(nowMs));
  const sink = new FakeFrameSink<FakeFrameHandle>();
  const decoderPort = new FakeVideoDecoderPort({ latencyTicks: 1, ...options.decoder });
  const session = new PlaybackSession<FakeFrameHandle>({
    frameSources: frameSources(),
    decoderPort,
    clock,
    sink,
    duration: DURATION,
    frameTimes: undefined,
    pipeline: { maxPendingPackets: 3, pairTolerance: seconds(0.0001) },
    queueCapacity: 4,
    ...options.parts,
  });
  const states: PlayerState[] = [];
  session.events.on('statechange', (state) => {
    states.push(state);
  });
  return {
    session,
    sink,
    decoderPort,
    clock,
    states,
    advance: async (ms): Promise<void> => {
      nowMs += ms;
      if (clock instanceof FakePlaybackClock) clock.advance(seconds(ms / MILLISECONDS_PER_SECOND));
      await settle();
      session.tick();
    },
  };
}
