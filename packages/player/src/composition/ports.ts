import type {
  Demuxer,
  GainMatchingFrameSink,
  PictureRenderer,
  PlaybackSession,
  RandomAccessSource,
  ResourceLocator,
  Signal,
  StabilizingFrameSink,
  VideoDecoderPort,
} from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import type { MediaInput } from '../PlayerSource';

/**
 * Turns a named input into the byte source the core reads.
 */
export interface SourceOpener {
  open(input: MediaInput): RandomAccessSource;
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
  readonly probeDeadline: () => Signal;
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
}

/**
 * Everything running for one loaded recording, as the player drives it: the session, the view
 * and size of the picture, and the picture settings. The stabilizing sink is present only when
 * the recording had a gyro to integrate.
 */
export interface Pipeline {
  readonly session: PlaybackSession<VideoFrame>;
  readonly renderer: Pick<PictureRenderer<VideoFrame>, 'setView' | 'setViewMode' | 'resize'>;
  readonly stabilizing: Pick<StabilizingFrameSink<VideoFrame>, 'setStabilizer'> | undefined;
  readonly gainMatching: Pick<GainMatchingFrameSink<VideoFrame>, 'enable' | 'disable'>;
  readonly warnings: readonly string[];
  dispose(): void;
}

/**
 * Builds what plays an opened recording; `buildPipeline` in a browser. Injected, so the player's
 * own logic can be exercised with any pipeline.
 */
export type PipelineFactory = (parts: PipelineParts) => Promise<Pipeline>;
