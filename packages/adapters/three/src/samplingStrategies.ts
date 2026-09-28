import type { PictureQuality } from '@gyroview/core';
import { LinearFilter, LinearMipmapLinearFilter, type MinificationTextureFilter } from 'three';

/**
 * How the shader reads a lens texture for a screen pixel, as `uSampling` names it: one bilinear
 * tap of the base level; one tap through the mip chain over the pixel's footprint; four taps
 * on a rotated grid within the footprint, each over a quarter of it.
 */
export const SAMPLING_BILINEAR = 0;
export const SAMPLING_TRILINEAR = 1;
export const SAMPLING_SUPERSAMPLED = 2;

/**
 * Strategy: what one picture quality asks of the lens textures and the shader.
 */
export interface SamplingStrategy {
  readonly minFilter: MinificationTextureFilter;
  readonly generateMipmaps: boolean;
  /**
   * Taps along the footprint's longer side, where the driver offers them (the equirectangular
   * poles and the rectilinear edges stretch a pixel's footprint several times longer than wide).
   */
  readonly anisotropy: number;
  readonly sampling: number;
}

const ISOTROPIC = 1;
const ANISOTROPY_BALANCED = 4;
const ANISOTROPY_HIGH = 8;

/**
 * The record keyed by the quality refuses to compile until every tier has a strategy.
 */
export const SAMPLING_STRATEGIES: Readonly<Record<PictureQuality, SamplingStrategy>> = {
  fast: {
    minFilter: LinearFilter,
    generateMipmaps: false,
    anisotropy: ISOTROPIC,
    sampling: SAMPLING_BILINEAR,
  },
  balanced: {
    minFilter: LinearMipmapLinearFilter,
    generateMipmaps: true,
    anisotropy: ANISOTROPY_BALANCED,
    sampling: SAMPLING_TRILINEAR,
  },
  high: {
    minFilter: LinearMipmapLinearFilter,
    generateMipmaps: true,
    anisotropy: ANISOTROPY_HIGH,
    sampling: SAMPLING_SUPERSAMPLED,
  },
};
