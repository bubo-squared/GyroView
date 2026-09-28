import { readPixels } from '@gyroview/adapter-three/testing';
import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import type { FramePair, Matrix3, PictureQuality } from '@gyroview/core';

import { greyOf, type GreyImage } from './referenceFrames';
import type { CanvasSize } from './rendering';

/**
 * The side of the square region the flicker is read on: the sharpest of the picture, where
 * aliasing shows first.
 */
const REGION_SIDE = 96;
/**
 * The renders timed per quality and size; alternating two pairs, so each render uploads a frame
 * and, above `fast`, builds its mip chain.
 */
const TIMED_RENDERS = 30;
const BOX = 2;
const REGION_STEP = REGION_SIDE / 2;
const LAPLACIAN_CENTRE_WEIGHT = 4;

/**
 * A pair and the lock stabilization of its instant.
 */
export interface LockedPair {
  readonly pair: FramePair<VideoFrame>;
  readonly lock: Matrix3;
}

export interface Region {
  readonly left: number;
  readonly top: number;
  readonly side: number;
}

export interface SamplingMeasurement {
  /**
   * Mean level difference between consecutive frames under lock over the sharpest region: what
   * moves on a still picture.
   */
  readonly flicker: number;
  /**
   * Mean level difference between the picture and the picture drawn at twice the size then
   * box-filtered down: what a pixel misses of what it covers.
   */
  readonly aliasing: number;
  /**
   * Milliseconds per render, upload included, at the size and at twice the size.
   */
  readonly millisecondsPerRender: number;
  readonly millisecondsPerRenderAtTwice: number;
  readonly region: Region;
}

/**
 * The panorama of one locked pair at the renderer's current quality, as a grey image from the
 * top down.
 */
export function renderLocked(
  renderer: ThreeFrameRenderer,
  canvas: HTMLCanvasElement,
  locked: LockedPair,
): GreyImage {
  renderer.setStabilization(locked.lock);
  renderer.present({ pair: locked.pair, mediaTime: locked.pair.timestamp });
  const size = { width: canvas.width, height: canvas.height };
  return { ...size, data: greyOf(readPixels(canvas), true, size) };
}

function laplacianAt(image: GreyImage, row: number, column: number): number {
  const { width, data } = image;
  const at = (r: number, c: number): number => data[r * width + c] ?? 0;
  const centre = LAPLACIAN_CENTRE_WEIGHT * at(row, column);
  return Math.abs(
    centre - at(row - 1, column) - at(row + 1, column) - at(row, column - 1) - at(row, column + 1),
  );
}

/**
 * The square region of `REGION_SIDE` with the most detail: the largest summed Laplacian, the
 * regions tried on a grid of half the side.
 */
export function sharpestRegionOf(image: GreyImage): Region {
  let best: Region = { left: 0, top: 0, side: REGION_SIDE };
  let bestDetail = -1;
  for (const region of candidateRegionsOf(image)) {
    const detail = detailOf(image, region);
    if (detail <= bestDetail) continue;
    bestDetail = detail;
    best = region;
  }
  return best;
}

/**
 * The regions tried, a texel in from the edges the Laplacian needs, on a grid of half the side.
 */
function candidateRegionsOf(image: GreyImage): Region[] {
  const regions: Region[] = [];
  for (let top = 1; top + REGION_SIDE < image.height - 1; top += REGION_STEP) {
    for (let left = 1; left + REGION_SIDE < image.width - 1; left += REGION_STEP) {
      regions.push({ left, top, side: REGION_SIDE });
    }
  }
  return regions;
}

function detailOf(image: GreyImage, region: Region): number {
  let total = 0;
  for (let row = region.top; row < region.top + region.side; row += 1) {
    for (let column = region.left; column < region.left + region.side; column += 1) {
      total += laplacianAt(image, row, column);
    }
  }
  return total;
}

/**
 * Mean absolute level difference between two images of one size over a region.
 */
export function differenceOver(a: GreyImage, b: GreyImage, region: Region): number {
  let total = 0;
  for (let row = region.top; row < region.top + region.side; row += 1) {
    for (let column = region.left; column < region.left + region.side; column += 1) {
      const index = row * a.width + column;
      total += Math.abs((a.data[index] ?? 0) - (b.data[index] ?? 0));
    }
  }
  return total / (region.side * region.side);
}

/**
 * The image at half its size, each pixel the mean of the 2x2 it covers.
 */
export function boxedDown(image: GreyImage): GreyImage {
  const width = image.width / BOX;
  const height = image.height / BOX;
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      data[row * width + column] = Math.round(boxMeanAt(image, row * BOX, column * BOX));
    }
  }
  return { width, height, data };
}

function boxMeanAt(image: GreyImage, row: number, column: number): number {
  let total = 0;
  for (let dr = 0; dr < BOX; dr += 1) {
    for (let dc = 0; dc < BOX; dc += 1) {
      total += image.data[(row + dr) * image.width + column + dc] ?? 0;
    }
  }
  return total / (BOX * BOX);
}

/**
 * Milliseconds per render of the two pairs in turn, the pixels read back at the end so the GPU
 * has finished. The first render, which compiles nothing new but warms the caches, is not timed.
 */
export function timeRenders(
  renderer: ThreeFrameRenderer,
  canvas: HTMLCanvasElement,
  pairs: readonly [LockedPair, LockedPair],
): number {
  renderLocked(renderer, canvas, pairs[0]);
  const started = performance.now();
  for (let index = 0; index < TIMED_RENDERS; index += 1) {
    const locked = pairs[index % pairs.length];
    if (!locked) throw new Error('no pair to time');
    renderer.setStabilization(locked.lock);
    renderer.present({ pair: locked.pair, mediaTime: locked.pair.timestamp });
  }
  readPixels(canvas);
  return (performance.now() - started) / TIMED_RENDERS;
}

export interface SamplingParts {
  readonly renderer: ThreeFrameRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly size: CanvasSize;
  readonly pairs: readonly [LockedPair, LockedPair];
  /**
   * The region the flicker and the aliasing are read on, one for every quality so that they
   * compare: the sharpest of the `fast` picture, where aliasing shows first.
   */
  readonly region: Region;
}

/**
 * Flicker, aliasing and timing of the renderer at `quality`, on the picture of the first pair.
 */
export interface SamplingResult {
  readonly measurement: SamplingMeasurement;
  readonly picture: GreyImage;
}

export function measureSampling(parts: SamplingParts, quality: PictureQuality): SamplingResult {
  const { renderer, canvas, size, pairs, region } = parts;
  renderer.setQuality(quality);
  renderer.resize(size);
  const picture = renderLocked(renderer, canvas, pairs[0]);
  const next = renderLocked(renderer, canvas, pairs[1]);
  const flicker = differenceOver(picture, next, region);
  const millisecondsPerRender = timeRenders(renderer, canvas, pairs);
  renderer.resize({ width: size.width * BOX, height: size.height * BOX });
  const twice = renderLocked(renderer, canvas, pairs[0]);
  const aliasing = differenceOver(picture, boxedDown(twice), region);
  const millisecondsPerRenderAtTwice = timeRenders(renderer, canvas, pairs);
  renderer.resize(size);
  return {
    picture,
    measurement: { flicker, aliasing, millisecondsPerRender, millisecondsPerRenderAtTwice, region },
  };
}
