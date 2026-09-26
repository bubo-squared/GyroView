/**
 * The composition below the player, for the integration tests that exercise it on real
 * recordings: opening a recording and the decode tuning the player plays with. Published as
 * `@gyroview/player/composition`; pages use the player and the element instead.
 */
export { DECODE_PIPELINE_OPTIONS, PAIR_QUEUE_CAPACITY } from './buildPipeline';
export { openRecording } from './openRecording';
export type { OpenedRecording } from './OpenedRecording';
