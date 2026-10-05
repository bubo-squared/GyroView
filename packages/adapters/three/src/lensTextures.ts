import { GyroViewError } from '@gyroview/core';
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

/**
 * Three would shrink a frame larger than the GPU's largest texture through a 2D canvas at every
 * upload, slowly and blurred, saying nothing; such a frame is refused instead.
 */
export function ensureUploadable(frame: VideoFrame, maxTextureSize: number): void {
  if (Math.max(frame.displayWidth, frame.displayHeight) <= maxTextureSize) return;
  throw new GyroViewError(
    'render-unavailable',
    `this GPU holds textures of at most ${maxTextureSize} pixels a side; a decoded frame is ${frame.displayWidth} x ${frame.displayHeight}`,
  );
}
