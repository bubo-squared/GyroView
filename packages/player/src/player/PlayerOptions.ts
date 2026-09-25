import type { FrameScheduler } from './FrameLoop';
import type { PipelineFactory, PipelineHost } from '../composition/buildPipeline';
import type { RecordingPorts } from '../composition/ports';

export interface PlayerParts {
  readonly host: PipelineHost;
  readonly ports: RecordingPorts<VideoFrame>;
  /**
   * Builds what plays each opened recording: `buildPipeline` in a browser.
   */
  readonly pipelines: PipelineFactory;
  readonly scheduler?: FrameScheduler;
}

/**
 * What concerns one load only. The settings (view, view mode, stabilization, gain matching,
 * sound, loop) belong to the player and carry over from load to load; set them on the player.
 */
export interface LoadOptions {
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
