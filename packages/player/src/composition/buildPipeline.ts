import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  GainMatchingFrameSink,
  PlaybackSession,
  seconds,
  stabilizerFor,
  StabilizingFrameSink,
  WallClock,
  type DecodePipelineOptions,
  type FrameSink,
  type PlaybackClock,
  messageOf,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import type { OpenedRecording } from './OpenedRecording';
import type { Pipeline, PipelineParts } from './ports';

/**
 * Half a millisecond: two lens tracks stamp the same instant within rounding of the timescale.
 */
const PAIR_TOLERANCE_SECONDS = 0.0005;
/**
 * Packets queued in each decoder, and decoded pairs held for presentation: a few frames keep a
 * hardware decoder busy and absorb jitter, while a seek has little to discard.
 */
const MAX_PENDING_PACKETS = 4;
export const PAIR_QUEUE_CAPACITY = 4;
export const DECODE_PIPELINE_OPTIONS: DecodePipelineOptions = {
  maxPendingPackets: MAX_PENDING_PACKETS,
  pairTolerance: seconds(PAIR_TOLERANCE_SECONDS),
};
const NO_AUDIO_WARNING = 'the recording has no audio track; playback follows a silent clock';
const AUDIO_UNSUPPORTED_WARNING =
  'this browser cannot play the audio track through Media Source Extensions; playback follows a silent clock';
const AUDIO_FAILED_WARNING =
  'the audio track could not be prepared for playback; playback follows a silent clock';

/**
 * Assembles the playing parts for an opened recording: the clock the picture follows, the GPU
 * stitcher, the stabilizing and gain-matching sinks in front of it and the session driving them.
 * Nothing here decides anything about the file; every choice was made while opening it.
 */
export async function buildPipeline(parts: PipelineParts): Promise<Pipeline> {
  const disposables = new Disposables();
  try {
    const clock = await clockFor(parts);
    disposables.add(() => {
      clock.clock.dispose();
    });
    // Two renderers on one canvas would share its GL context; a superseded load stops here.
    parts.signal.throwIfAborted();
    const drawing = drawingFor(parts, disposables);
    const session = sessionFor(parts, clock.clock, drawing.gainMatching);
    disposables.add(() => {
      session.dispose();
    });
    return {
      session,
      renderer: drawing.renderer,
      ...pictureSettingsOf(drawing, session),
      warnings: clock.warnings,
      dispose: disposables.toDisposer(),
    };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

interface Drawing {
  readonly renderer: ThreeFrameRenderer;
  readonly stabilizing: StabilizingFrameSink<VideoFrame> | undefined;
  /**
   * The front of the chain the session presents to.
   */
  readonly gainMatching: GainMatchingFrameSink<VideoFrame>;
}

/**
 * The GPU stitcher on the host canvas, behind the stabilizing sink when there is a gyro, behind
 * gain matching, which measures what the stitcher drew.
 */
function drawingFor(parts: PipelineParts, disposables: Disposables): Drawing {
  const setup = stitchingSetupOf(parts.opened);
  const renderer = ThreeFrameRenderer.create(parts.host.canvas, setup);
  disposables.add(() => {
    renderer.dispose();
  });
  const { sink, stabilizing } = sinkOver(renderer, parts.opened);
  const gainMatching = new GainMatchingFrameSink({
    sink,
    renderer,
    lensCount: setup.lenses.length,
  });
  disposables.add(() => {
    gainMatching.dispose();
  });
  return { renderer, stabilizing, gainMatching };
}

/**
 * Each setting goes to the sink it concerns, and the frame standing on screen is drawn again, so
 * the change shows while paused.
 */
function pictureSettingsOf(
  drawing: Drawing,
  session: PlaybackSession<VideoFrame>,
): Pick<Pipeline, 'setStabilization' | 'setGainMatching'> {
  return {
    setStabilization: (mode): void => {
      drawing.stabilizing?.setStabilizer(stabilizerFor(mode));
      session.redraw();
    },
    setGainMatching: (isEnabled): void => {
      if (isEnabled) drawing.gainMatching.enable();
      else drawing.gainMatching.disable();
      session.redraw();
    },
  };
}

interface ChosenClock {
  readonly clock: PlaybackClock;
  readonly warnings: readonly string[];
}

/**
 * The recording's own audio when there is a track this browser can feed to the element;
 * otherwise a wall clock, with a warning saying why there is no sound.
 */
async function clockFor(parts: PipelineParts): Promise<ChosenClock> {
  const { audioTrack } = parts.opened;
  if (!audioTrack) return wallClock(NO_AUDIO_WARNING);
  try {
    const segments = await audioTrack.openSegments();
    if (!MediaSourceAudioClock.isSupported(segments)) return wallClock(AUDIO_UNSUPPORTED_WARNING);
    // The audio element is the host's, shared with any newer load: a superseded load must not
    // take it over. The pipeline stops right after this, whatever clock it got.
    parts.signal.throwIfAborted();
    const clock = await MediaSourceAudioClock.open(parts.host.audio, segments);
    return { clock, warnings: [] };
  } catch (error) {
    // Sound is a comfort, the picture is the point: a broken audio path must not stop playback.
    return wallClock(`${AUDIO_FAILED_WARNING} (${messageOf(error)})`);
  }
}

function wallClock(warning: string): ChosenClock {
  return { clock: new WallClock(), warnings: [warning] };
}

function stitchingSetupOf(opened: OpenedRecording): ReturnType<typeof buildStitchingSetup> {
  return buildStitchingSetup({ calibration: opened.calibration, layout: opened.layout });
}

interface SinkChoice {
  readonly sink: FrameSink<VideoFrame>;
  readonly stabilizing: StabilizingFrameSink<VideoFrame> | undefined;
}

function sinkOver(renderer: ThreeFrameRenderer, opened: OpenedRecording): SinkChoice {
  if (!opened.motion) return { sink: renderer, stabilizing: undefined };
  const stabilizing = new StabilizingFrameSink<VideoFrame>({
    sink: renderer,
    orientations: opened.motion.orientations,
    frameTimes: opened.frameTimes,
  });
  return { sink: stabilizing, stabilizing };
}

function sessionFor(
  parts: PipelineParts,
  clock: PlaybackClock,
  sink: FrameSink<VideoFrame>,
): PlaybackSession<VideoFrame> {
  return new PlaybackSession<VideoFrame>({
    frameSources: parts.opened.frameSources,
    decoderPort: parts.decoderPort,
    clock,
    sink,
    duration: parts.opened.duration,
    pipeline: DECODE_PIPELINE_OPTIONS,
    queueCapacity: PAIR_QUEUE_CAPACITY,
  });
}
