import type {
  Demuxer,
  RandomAccessSource,
  ResourceLocator,
  Signal,
  VideoDecoderPort,
} from '@gyroview/core';

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
