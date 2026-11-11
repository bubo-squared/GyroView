import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  buildStitchingSetup,
  GainMatchingFrameSink,
  isFlowing,
  messageOf,
  PlaybackSession,
  referenceLensOf,
  seconds,
  stabilizerFor,
  StabilizingFrameSink,
  UPRIGHT_MOUNTING,
  WallClock,
  type DecodePipelineOptions,
  type FrameSink,
  type GainRenderer,
  type PictureRenderer,
  type PlaybackClock,
  type StitchingSetup,
} from '@gyroview/core';

import { AnimationFrameDraws } from './AnimationFrameDraws';
import { Disposables } from './Disposables';
import { DrawingBufferFit } from './DrawingBufferFit';
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
    readAheadOnceFlowing(session, parts.opened);
    return {
      session,
      renderer: drawing.renderer,
      ...pictureSettingsOf(drawing, session),
      soundWarnings: clock.warnings,
      dispose: disposables.toDisposer(),
    };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

interface Drawing extends Sinks {
  readonly renderer: ThreeFrameRenderer;
  /**
   * The drawing buffer kept to the canvas's size, as many device pixels as the quality allows.
   */
  readonly fit: DrawingBufferFit;
}

/**
 * The GPU stitcher on the host canvas, behind the sinks every renderer of the recording is
 * presented through. A change of the view or the gains is drawn once at the next animation
 * frame, where a frame presented in it draws it anyway.
 */
function drawingFor(parts: PipelineParts, disposables: Disposables): Drawing {
  const setup = stitchingSetupOf(parts.opened);
  const renderer = ThreeFrameRenderer.create(parts.host.canvas, setup, {
    drawSchedule: new AnimationFrameDraws(),
  });
  disposables.add(() => {
    renderer.dispose();
  });
  const fit = new DrawingBufferFit(parts.host.canvas, renderer);
  disposables.add(() => {
    fit.dispose();
  });
  const sinks = sinksOver(renderer, parts.opened, setup);
  disposables.add(() => {
    sinks.gainMatching.dispose();
  });
  return { renderer, fit, ...sinks };
}

/**
 * Each setting goes to the sink it concerns, and the frame standing on screen is drawn again, so
 * the change shows while paused.
 */
function pictureSettingsOf(
  drawing: Drawing,
  session: PlaybackSession<VideoFrame>,
): Pick<Pipeline, 'setStabilization' | 'setGainMatching' | 'setQuality'> {
  return {
    setStabilization: (mode): void => {
      drawing.stabilizing?.setStabilizer(stabilizerFor(mode));
      session.redraw();
    },
    // How finely the lenses are read, and how many device pixels are drawn.
    setQuality: (quality): void => {
      drawing.renderer.setQuality(quality);
      drawing.fit.setQuality(quality);
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
  const { soundSegments } = parts.opened;
  if (!soundSegments) return wallClock(parts.pageTime, NO_AUDIO_WARNING);
  try {
    const segments = soundSegments();
    if (!MediaSourceAudioClock.isSupported(segments))
      return wallClock(parts.pageTime, AUDIO_UNSUPPORTED_WARNING);
    // The audio element is the host's, shared with any newer load: a superseded load must not
    // take it over. The pipeline stops right after this, whatever clock it got.
    parts.signal.throwIfAborted();
    const clock = await MediaSourceAudioClock.open(parts.host.audio, segments);
    return { clock, warnings: [] };
  } catch (error) {
    // Sound is a comfort, the picture is the point: a broken audio path must not stop playback.
    return wallClock(parts.pageTime, `${AUDIO_FAILED_WARNING} (${messageOf(error)})`);
  }
}

/**
 * A clock over the monotonic page time, which a change of the system clock does not move.
 */
function wallClock(pageTime: PipelineParts['pageTime'], warning: string): ChosenClock {
  return { clock: new WallClock(pageTime), warnings: [warning] };
}

/**
 * How the recording's lenses are stitched: what every renderer of it draws with.
 */
export function stitchingSetupOf(opened: OpenedRecording): StitchingSetup {
  return buildStitchingSetup({
    calibration: opened.calibration,
    layout: opened.layout,
    displayConversions: opened.displayConversions,
  });
}

/**
 * The sinks a renderer of the recording is presented through, the player's and a rendition's.
 */
export interface Sinks {
  /**
   * Where the stabilization mode is set; undefined without a gyro.
   */
  readonly stabilizing: StabilizingFrameSink<VideoFrame> | undefined;
  /**
   * The front of the chain, which pairs are presented to; its owner disposes of it.
   */
  readonly gainMatching: GainMatchingFrameSink<VideoFrame>;
}

/**
 * The renderer at the end of the sinks: turned before each pair it draws, its gains matched.
 */
export type SinkRenderer = Pick<
  PictureRenderer<VideoFrame>,
  'present' | 'setStabilization' | 'setRowCorrections'
> &
  GainRenderer<VideoFrame>;

/**
 * What the sinks read of the recording: its motion, and the frame times a pair is turned for.
 */
export type SinkMotion = Pick<OpenedRecording, 'motion' | 'frameTimes'>;

/**
 * Gain matching, which measures what the renderer drew, in front of the stabilizing sink, or of
 * the renderer itself when there is no gyro, turned upright once then; one place, so that the
 * player and a rendition draw a recording alike.
 */
export function sinksOver(
  renderer: SinkRenderer,
  opened: SinkMotion,
  setup: Pick<StitchingSetup, 'lenses'>,
): Sinks {
  const { sink, stabilizing } = sinkBehindGainMatching(renderer, opened);
  const mounting = opened.motion?.mounting ?? UPRIGHT_MOUNTING;
  const gainMatching = new GainMatchingFrameSink(
    sink,
    renderer,
    referenceLensOf(setup.lenses, mounting),
  );
  return { stabilizing, gainMatching };
}

interface SinkChoice {
  readonly sink: FrameSink<VideoFrame>;
  readonly stabilizing: StabilizingFrameSink<VideoFrame> | undefined;
}

/**
 * The stabilizing sink when there is a gyro, the renderer itself, drawing the body upright, when
 * there is none.
 */
function sinkBehindGainMatching(renderer: SinkRenderer, opened: SinkMotion): SinkChoice {
  if (!opened.motion) {
    // Without a gyro the body is drawn as recorded, facing where an upright camera faces.
    renderer.setStabilization(UPRIGHT_MOUNTING.toBody);
    return { sink: renderer, stabilizing: undefined };
  }
  const stabilizing = new StabilizingFrameSink<VideoFrame>({
    sink: renderer,
    motion: opened.motion,
    frameTimes: opened.frameTimes,
    rollingShutter: opened.motion.rollingShutter,
  });
  return { sink: stabilizing, stabilizing };
}

/**
 * The downloads read only what the picture waits for until playing first starts, so a page of
 * players that were never played stays quiet; from then on they read ahead, paused or not.
 */
function readAheadOnceFlowing(session: PlaybackSession<VideoFrame>, opened: OpenedRecording): void {
  session.events.on('statechange', (state) => {
    if (isFlowing(state)) opened.readAhead();
  });
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
    buffer: parts.opened.buffer,
    pipeline: DECODE_PIPELINE_OPTIONS,
    queueCapacity: PAIR_QUEUE_CAPACITY,
  });
}
