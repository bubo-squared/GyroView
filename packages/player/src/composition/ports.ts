import type {
  AudioPackager,
  ByteStream,
  CodecReader,
  PictureQuality,
  PictureRenderer,
  PlaybackSession,
  RandomAccessSource,
  ResourceLocator,
  Deferred,
  Seconds,
  StabilizationMode,
  VideoDecoderPort,
} from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import type { MediaInput, UrlInput } from '../PlayerSource';

/**
 * One input's bytes, as the core reads them: at random, to open the recording, and streamed in
 * ranges while it plays (ADR 0029). Both read one file, so they know one size and one version.
 */
export interface OpenedSource {
  readonly source: RandomAccessSource;
  readonly stream: ByteStream;
  /**
   * How long the source's server has taken to answer a request, once the reads that open the
   * file have asked it (ADR 0044); none for a source that has no server, such as a local file.
   */
  readonly answerWait?: (() => Seconds | undefined) | undefined;
}

/**
 * Opens a named input's bytes; `signal` ends the reads of a load that was given up, so a
 * superseded load stops downloading.
 */
export interface SourceOpener {
  open(input: MediaInput, signal: AbortSignal): OpenedSource;
}

/**
 * Everything the composition root needs from outside the core to open a recording. The browser
 * supplies adapters; tests supply doubles.
 */
export interface RecordingPorts<Handle = unknown> {
  readonly sources: SourceOpener;
  readonly codecReader: CodecReader;
  readonly audioPackager: AudioPackager;
  readonly decoderPort: VideoDecoderPort<Handle>;
  /**
   * Looks for files beside `input` as `input` itself is read, so the other lens file of a split
   * pair is asked for with the main file's credentials; `signal` ends the look with the load.
   */
  readonly locatorFor: (input: UrlInput, signal: AbortSignal) => ResourceLocator;
  /**
   * A fresh signal that fires when a decode probe has taken too long.
   */
  readonly probeDeadline: () => Deferred<void>;
}

/**
 * The DOM the pipeline draws on and plays sound through; both borrowed from the element.
 */
/**
 * Where the player draws and sounds. The canvas is read at each load and each measure, so a host
 * may hand a fresh one between loads, as the element does for one whose WebGL context is gone.
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
   * How finely the lens images are read, and how many device pixels are drawn.
   */
  setQuality(quality: PictureQuality): void;
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
