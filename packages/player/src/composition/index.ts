/**
 * The composition below the player, for the integration tests that exercise it on real
 * recordings and for hosts that assemble a player from other parts: the browser's ports, the
 * pipeline and the contract between them, opening a recording, and the decode tuning the player
 * plays with. Published as `@gyroview/player/composition`; pages use `createBrowserPlayer` and
 * the element instead.
 */
export { NO_ATTITUDE_SENSOR, type AttitudeSensor } from './attitudeSensor';
export { BrowserAttitudeSensor, type AttitudeSource } from './BrowserAttitudeSensor';
export { browserPorts } from './browserPorts';
export { buildPipeline, DECODE_PIPELINE_OPTIONS, PAIR_QUEUE_CAPACITY } from './buildPipeline';
export { openRecording } from './openRecording';
export type { OpenedRecording } from './OpenedRecording';
export type {
  Pipeline,
  PipelineFactory,
  PipelineParts,
  RecordingPorts,
  OpenedSource,
  SourceOpener,
} from './ports';
