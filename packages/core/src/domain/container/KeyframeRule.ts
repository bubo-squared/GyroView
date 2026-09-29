/**
 * Whether a sample's own bytes let decoding start there. A sample table may list as a sync
 * sample one that is not; the bitstream decides. Strategies per codec family come from the
 * format layer, which knows the bitstreams.
 */
export interface KeyframeRule {
  isKeyframe(sample: Uint8Array): boolean;
}

/**
 * For tracks whose every sample decodes on its own, as audio does.
 */
export const EVERY_SAMPLE_IS_A_KEYFRAME: KeyframeRule = {
  isKeyframe: (): boolean => true,
};
