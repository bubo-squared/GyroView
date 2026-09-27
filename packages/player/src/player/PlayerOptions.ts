import type { PipelineFactory, PipelineHost, RecordingPorts } from '../composition/ports';

export interface PlayerParts {
  readonly host: PipelineHost;
  readonly ports: RecordingPorts<VideoFrame>;
  /**
   * Builds what plays each opened recording: `buildPipeline` in a browser.
   */
  readonly pipelines: PipelineFactory;
}

/**
 * A view as a page gives it and gets it back: yaw positive to the right, pitch positive up, and
 * the horizontal field of view, all in degrees.
 */
export interface ViewAngles {
  readonly yaw: number;
  readonly pitch: number;
  readonly fieldOfView: number;
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
