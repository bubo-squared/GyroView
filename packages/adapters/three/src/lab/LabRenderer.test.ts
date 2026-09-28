import {
  buildStitchingSetup,
  multiplyMatrices,
  radians,
  rotationAboutY,
  seconds,
  type DecodedFrame,
  type Vector3,
} from '@gyroview/core';
import { equirectangularPixelOf } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { LabRenderer } from './LabRenderer';
import { nearScenePair } from '../test/nearScene';
import { readPixels } from '../test/readPixels';
import { solidFrame } from '../test/syntheticFrames';
import { MULTI_TRACK, syntheticCalibration } from '../test/syntheticStitching';
import { ThreeFrameRenderer } from '../ThreeFrameRenderer';

const SIZE = { width: 64, height: 32 };
const RGBA = 4;
const MIXED = 60;
const DIM = 40;
const NEAR = 4;

describe('LabRenderer', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  function canvasOfSize(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width;
    canvas.height = SIZE.height;
    document.body.append(canvas);
    canvases.push(canvas);
    return canvas;
  }

  function present(renderer: ThreeFrameRenderer, pair: DecodedFrame<VideoFrame>[]): void {
    frames.push(...pair);
    renderer.present({ pair: { timestamp: seconds(0), frames: pair }, mediaTime: seconds(0) });
  }

  function levelsTowards(canvas: HTMLCanvasElement, direction: Vector3): Uint8ClampedArray {
    const { column, row } = equirectangularPixelOf(direction, SIZE);
    const offset = ((SIZE.height - 1 - row) * SIZE.width + column) * RGBA;
    return readPixels(canvas).slice(offset, offset + RGBA);
  }

  it('draws under the fixed join exactly what the player’s renderer draws', () => {
    const calibration = syntheticCalibration();
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const drawn = [ThreeFrameRenderer, LabRenderer].map((kind) => {
      const canvas = canvasOfSize();
      const renderer = kind.create(canvas, setup, { preserveDrawingBuffer: true });
      renderers.push(renderer);
      renderer.setViewMode('equirectangular');
      present(renderer, nearScenePair({ calibration, setup, disparity: () => NEAR }));
      return readPixels(canvas);
    });
    expect(drawn[1]).toEqual(drawn[0]);
  });

  it('turns one lens to a new pose: the back lens turned to face forward shows with the front, and the back goes black', () => {
    const setup = buildStitchingSetup({ calibration: syntheticCalibration(), layout: MULTI_TRACK });
    const canvas = canvasOfSize();
    const renderer = LabRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    renderer.setViewMode('equirectangular');
    present(renderer, [solidFrame('#ff0000'), solidFrame('#0000ff')]);
    const back = setup.lenses[1];
    if (!back) throw new Error('the synthetic calibration has two lenses');
    const halfTurn = rotationAboutY(radians(Math.PI));
    renderer.setLensPose(1, multiplyMatrices(back.rotation, halfTurn));
    const [aheadRed = 0, , aheadBlue = 0] = levelsTowards(canvas, [0, 0, 1]);
    expect(aheadRed).toBeGreaterThan(MIXED);
    expect(aheadBlue).toBeGreaterThan(MIXED);
    const [behindRed = 0, , behindBlue = 0] = levelsTowards(canvas, [0, 0, -1]);
    expect(behindRed).toBeLessThan(DIM);
    expect(behindBlue).toBeLessThan(DIM);
  });
});
