import type { Rectangle } from '../../shared/math/Rectangle';

export type LensLayoutKind = 'multi-track' | 'split-files' | 'packed';

/**
 * Normalised rectangle within a decoded frame (0..1 on both axes) that holds one lens image.
 */
export type FrameRegion = Rectangle<'frame fractions'>;

/**
 * Where the pixels of one calibrated lens come from.
 */
export interface LensSource {
  readonly lensIndex: number;
  readonly inputIndex: number;
  readonly trackIndex: number;
  readonly region: FrameRegion;
}

export interface LensLayout {
  readonly kind: LensLayoutKind;
  readonly sources: readonly LensSource[];
  /**
   * Why this layout was chosen, for the `ready` metadata and for debugging unseen cameras.
   */
  readonly evidence: readonly string[];
}

export const FULL_FRAME: FrameRegion = { x: 0, y: 0, width: 1, height: 1 };
export const LEFT_HALF: FrameRegion = { x: 0, y: 0, width: 0.5, height: 1 };
export const RIGHT_HALF: FrameRegion = { x: 0.5, y: 0, width: 0.5, height: 1 };
