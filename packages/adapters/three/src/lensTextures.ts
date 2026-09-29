import { LinearFilter, NoColorSpace, VideoFrameTexture } from 'three';

import type { SamplingStrategy } from './samplingStrategies';

/**
 * The textures the decoded frames are uploaded to, one per frame of a pair, read with the
 * given strategy. Three uploads a video frame with `texImage2D` and builds the mip chain after
 * it when asked; the anisotropy applies where the driver offers it and the filter uses the
 * chain.
 */
export function createLensTextures(count: number, strategy: SamplingStrategy): VideoFrameTexture[] {
  return Array.from({ length: count }, () => {
    const texture = new VideoFrameTexture();
    texture.flipY = false;
    texture.colorSpace = NoColorSpace;
    texture.magFilter = LinearFilter;
    applyTextureFilters(texture, strategy);
    return texture;
  });
}

export function applyTextureFilters(texture: VideoFrameTexture, strategy: SamplingStrategy): void {
  texture.minFilter = strategy.minFilter;
  texture.generateMipmaps = strategy.generateMipmaps;
  texture.anisotropy = strategy.anisotropy;
}
