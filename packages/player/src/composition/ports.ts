import type {
  Demuxer,
  PictureRenderer,
  PlaybackSession,
  RandomAccessSource,
  ResourceLocator,
  Deferred,
  StabilizationMode,
  VideoDecoderPort,
} from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import type { MediaInput } from '../PlayerSource';

/**
 * Turns a named input into the byte source the core reads; `signal` ends the reads of a load
 * that was given up, so a superseded load stops downloading.
 */
export interface SourceOpener {
  open(input: MediaInput, signal: AbortSignal): RandomAccessSource;
}

/**
 * Everything the composition root needs from outside the core to open a recording. The browser
 * supplies adapters; tests supply doubles.
 */
export interface RecordingPorts<Handle = unknown> {
  readonly sources: SourceOpener;
  readonly demuxer: Demuxer;
  readonly decoderPort: VideoDecoderPort<Handle>;
  readonly locator: ResourceLocator;
  /**
   * A fresh signal that fires when a decode probe has taken too long.
   */
  readonly probeDeadline: () => Deferred<void>;
}

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
  /**
   * Aborts a load a newer one superseded, before it draws on the host's canvas.
   */
  readonly signal: AbortSignal;
}

/**
 * Everything running for one loaded recording, as the player drives it: the session, the view
 * and size of the picture, and the picture settings, each shown at once, even while paused.
 */
export interface Pipeline {
  readonly session: PlaybackSession<VideoFrame>;
  readonly renderer: Pick<
    PictureRenderer<VideoFrame>,
    'setFraming' | 'setViewMode' | 'resize' | 'lensCount'
  >;
  /**
   * A recording without a gyro stays as recorded, whatever the mode.
   */
  setStabilization(mode: StabilizationMode): void;
  /**
   * Matches the lenses' exposure along the seam, or shows it as recorded.
   */
  setGainMatching(isEnabled: boolean): void;
  /**
   * Why the recording plays without sound, when it does: it has none, or none this browser plays.
   */
  readonly soundWarnings: readonly string[];
  dispose(): void;
}

/**
 * Builds what plays an opened recording; `buildPipeline` in a browser. Injected, so the player's
 * own logic can be exercised with any pipeline.
 */
export type PipelineFactory = (parts: PipelineParts) => Promise<Pipeline>;
