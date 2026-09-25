import { MediabunnyAudioSegmenter } from '@gyroview/adapter-mediabunny';
import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  PlaybackSession,
  seconds,
  StabilizingFrameSink,
  WallClock,
  type AudioTrackReader,
  type DecodePipelineOptions,
  type FrameSink,
  type PlaybackClock,
  type Presentation,
  type VideoDecoderPort,
  type ViewMode,
  type ViewState,
  messageOf,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import type { OpenedRecording } from './OpenedRecording';

/**
 * The DOM the pipeline draws on and plays sound through; both borrowed from the element.
 */
export interface PipelineHost {
  readonly canvas: HTMLCanvasElement;
  readonly audio: HTMLMediaElement;
}

export interface PipelineParts {
  readonly opened: OpenedRecording;
  readonly host: PipelineHost;
  readonly decoderPort: VideoDecoderPort<VideoFrame>;
  readonly view: ViewState;
  readonly viewMode: ViewMode;
  /**
   * Told about every presented pair, after the renderer drew it.
   */
  readonly onPresent: (presentation: Presentation<VideoFrame>) => void;
}

export type ClockKind = 'audio' | 'wall';

/**
 * Everything running for one loaded recording. The stabilizing sink is present only when the
 * recording had a gyro to integrate.
 */
export interface Pipeline {
  readonly session: PlaybackSession<VideoFrame>;
  readonly renderer: ThreeFrameRenderer;
  readonly stabilizing: StabilizingFrameSink<VideoFrame> | undefined;
  readonly clock: PlaybackClock;
  readonly clockKind: ClockKind;
  readonly warnings: readonly string[];
  dispose(): void;
}

/**
 * Half a millisecond: two lens tracks stamp the same instant within rounding of the timescale.
 */
const PAIR_TOLERANCE_SECONDS = 0.0005;
/**
 * Packets queued in each decoder, and decoded pairs held for presentation: a few frames keep a
 * hardware decoder busy and absorb jitter, while a seek has little to discard.
 */
const MAX_PENDING_PACKETS = 4;
const QUEUE_CAPACITY = 4;
const PIPELINE_OPTIONS: DecodePipelineOptions = {
  maxPendingPackets: MAX_PENDING_PACKETS,
  pairTolerance: seconds(PAIR_TOLERANCE_SECONDS),
};
/**
 * Seconds of sound kept buffered past the playhead; a seek discards and refills it.
 */
const AUDIO_BUFFER_AHEAD_SECONDS = 30;

const NO_AUDIO_WARNING = 'the recording has no audio track; playback follows a silent clock';
const AUDIO_UNSUPPORTED_WARNING =
  'this browser cannot play the audio track through Media Source Extensions; playback follows a silent clock';
const AUDIO_FAILED_WARNING =
  'the audio track could not be prepared for playback; playback follows a silent clock';

/**
 * Assembles the playing parts for an opened recording: the clock the picture follows, the
 * GPU stitcher, the stabilizing sink in front of it and the session driving them. Nothing here
 * decides anything about the file; every choice was made while opening it.
 */
export async function buildPipeline(parts: PipelineParts): Promise<Pipeline> {
  const disposables = new Disposables();
  try {
    const clock = await clockFor(parts.opened.audioTrack, parts.host.audio);
    disposables.add(() => {
      clock.clock.dispose();
    });
    const drawing = drawingFor(parts, disposables);
    const session = sessionFor(parts, clock.clock, observed(drawing.sink, parts.onPresent));
    disposables.add(() => {
      session.dispose();
    });
    return {
      session,
      renderer: drawing.renderer,
      stabilizing: drawing.stabilizing,
      clock: clock.clock,
      clockKind: clock.kind,
      warnings: clock.warnings,
      dispose: disposables.toDisposer(),
    };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

interface Drawing extends SinkChoice {
  readonly renderer: ThreeFrameRenderer;
}

/**
 * The GPU stitcher on the host canvas, behind the stabilizing sink when there is a gyro.
 */
function drawingFor(parts: PipelineParts, disposables: Disposables): Drawing {
  const renderer = ThreeFrameRenderer.create(parts.host.canvas, stitchingSetupOf(parts.opened), {
    view: parts.view,
    viewMode: parts.viewMode,
  });
  disposables.add(() => {
    renderer.dispose();
  });
  return { renderer, ...sinkOver(renderer, parts.opened) };
}

interface ChosenClock {
  readonly clock: PlaybackClock;
  readonly kind: ClockKind;
  readonly warnings: readonly string[];
}

/**
 * The recording's own audio when there is a track this browser can feed to the element;
 * otherwise a wall clock, with a warning saying why there is no sound.
 */
async function clockFor(
  audioTrack: AudioTrackReader | undefined,
  audio: HTMLMediaElement,
): Promise<ChosenClock> {
  if (!audioTrack) return wallClock(NO_AUDIO_WARNING);
  try {
    const segments = await new MediabunnyAudioSegmenter().open(audioTrack);
    if (!MediaSourceAudioClock.isSupported(segments)) return wallClock(AUDIO_UNSUPPORTED_WARNING);
    const clock = await MediaSourceAudioClock.open(audio, segments, {
      bufferAhead: seconds(AUDIO_BUFFER_AHEAD_SECONDS),
    });
    return { clock, kind: 'audio', warnings: [] };
  } catch (error) {
    // Sound is a comfort, the picture is the point: a broken audio path must not stop playback.
    return wallClock(`${AUDIO_FAILED_WARNING} (${messageOf(error)})`);
  }
}

function wallClock(warning: string): ChosenClock {
  return { clock: new WallClock(), kind: 'wall', warnings: [warning] };
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

/**
 * Lets the player know when a picture has actually been drawn (to hide a poster, count frames).
 */
function observed(
  sink: FrameSink<VideoFrame>,
  onPresent: PipelineParts['onPresent'],
): FrameSink<VideoFrame> {
  return {
    present: (presentation): void => {
      sink.present(presentation);
      onPresent(presentation);
    },
  };
}

function sessionFor(
  parts: PipelineParts,
  clock: PlaybackClock,
  sink: FrameSink<VideoFrame>,
): PlaybackSession<VideoFrame> {
  return new PlaybackSession<VideoFrame>({
    lensTracks: parts.opened.lensTracks,
    decoderPort: parts.decoderPort,
    clock,
    sink,
    duration: parts.opened.duration,
    frameTimes: parts.opened.frameTimes,
    pipeline: PIPELINE_OPTIONS,
    queueCapacity: QUEUE_CAPACITY,
  });
}
