import type { StabilizationMode, ViewState } from '@gyroview/core';

import type { FrameScheduler } from './FrameLoop';
import type { PipelineHost } from '../composition/buildPipeline';
import type { RecordingPorts } from '../composition/ports';

export interface PlayerParts {
  readonly host: PipelineHost;
  readonly ports: RecordingPorts<VideoFrame>;
  readonly scheduler?: FrameScheduler;
}

export interface LoadOptions {
  readonly view?: ViewState;
  readonly stabilization?: StabilizationMode;
  /**
   * Start as soon as the recording is ready; a refusal by the autoplay policy is a warning.
   */
  readonly autoplay?: boolean;
  /**
   * Decode the first frame as soon as the recording is ready, so it shows instead of a black
   * canvas. Default true; off keeps the decoders idle until play.
   */
  readonly preload?: boolean;
}
