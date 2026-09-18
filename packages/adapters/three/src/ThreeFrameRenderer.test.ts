import {
  buildStitchingSetup,
  CalibrationVersion,
  DEFAULT_HALF_FIELD_OF_VIEW,
  DEFAULT_VIEW,
  degrees,
  EquidistantModel,
  FULL_FRAME,
  seconds,
  type CalibrationSet,
  type DecodedFrame,
  type LensLayout,
  type Presentation,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const WIDTH = 64;
const HEIGHT = 32;
const SQUARE = 1000;
const HALF_SQUARE = 500;
const BRIGHT = 200;
const DIM = 40;
const MIXED = 60;
/**
 * Pixels straddling the yaw-90 seam where the two lens weights swap.
 */
const FAINT = 15;
const SEAM_COLUMN = (WIDTH * 3) / 4;

/**
 * Two ideal 200-degree lenses back to back on a canvas of two squares, no pose corrections.
 */
function syntheticCalibration(): CalibrationSet {
  const lens = (lensIndex: number): CalibrationSet['lenses'][number] => ({
    lensIndex,
    model: new EquidistantModel(
      {
        edgeRadius: HALF_SQUARE,
        principalPoint: { x: lensIndex * SQUARE + HALF_SQUARE, y: HALF_SQUARE },
      },
      DEFAULT_HALF_FIELD_OF_VIEW,
    ),
    orientation: { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) },
    translation: [0, 0, 0],
    lensType: undefined,
  });
  return {
    version: CalibrationVersion.Legacy,
    canvas: { width: 2 * SQUARE, height: SQUARE },
    lenses: [lens(0), lens(1)],
  };
}

const MULTI_TRACK: LensLayout = {
  kind: 'multi-track',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
    { lensIndex: 1, inputIndex: 0, trackIndex: 1, region: FULL_FRAME },
  ],
  evidence: [],
};

function solidFrame(fillStyle: string): DecodedFrame<VideoFrame> {
  const source = document.createElement('canvas');
  source.width = WIDTH;
  source.height = WIDTH;
  const context = source.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.fillStyle = fillStyle;
  context.fillRect(0, 0, WIDTH, WIDTH);
  const frame = new VideoFrame(source, { timestamp: 0 });
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function pixelAt(renderer: ThreeFrameRenderer, x: number, yFromTop: number): Rgb {
  const pixels = renderer.readPixels();
  const row = HEIGHT - 1 - yFromTop;
  const offset = (row * WIDTH + x) * 4;
  return { r: pixels[offset] ?? -1, g: pixels[offset + 1] ?? -1, b: pixels[offset + 2] ?? -1 };
}

describe('ThreeFrameRenderer', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  function open(): ThreeFrameRenderer {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.append(canvas);
    canvases.push(canvas);
    const setup = buildStitchingSetup({
      calibration: syntheticCalibration(),
      layout: MULTI_TRACK,
      windowCrop: undefined,
    });
    const renderer = ThreeFrameRenderer.create(canvas, setup, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    return renderer;
  }

  function presentRedAndBlue(renderer: ThreeFrameRenderer): void {
    const pair = [solidFrame('#ff0000'), solidFrame('#0000ff')];
    frames.push(...pair);
    const presentation: Presentation<VideoFrame> = {
      pair: { timestamp: seconds(0), frames: pair },
      mediaTime: seconds(0),
      frameIndex: undefined,
    };
    renderer.present(presentation);
  }

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('shows lens 0 straight ahead, lens 1 behind, and blends both at the seam in an equirectangular view', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    presentRedAndBlue(renderer);
    const ahead = pixelAt(renderer, WIDTH / 2, HEIGHT / 2);
    expect(ahead.r).toBeGreaterThan(BRIGHT);
    expect(ahead.b).toBeLessThan(DIM);
    const behind = pixelAt(renderer, 0, HEIGHT / 2);
    expect(behind.b).toBeGreaterThan(BRIGHT);
    expect(behind.r).toBeLessThan(DIM);
    const justBeforeSeam = pixelAt(renderer, SEAM_COLUMN - 1, HEIGHT / 2);
    const justAfterSeam = pixelAt(renderer, SEAM_COLUMN, HEIGHT / 2);
    expect(justBeforeSeam.r).toBeGreaterThan(BRIGHT);
    expect(justBeforeSeam.b).toBeGreaterThan(FAINT);
    expect(justAfterSeam.b).toBeGreaterThan(BRIGHT);
    expect(justAfterSeam.r).toBeGreaterThan(FAINT);
  });

  it('follows the view: yaw turns to the other lens and looking straight up hits the seam', () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, WIDTH / 2, HEIGHT / 2).r).toBeGreaterThan(BRIGHT);
    renderer.setView({ ...DEFAULT_VIEW, yaw: degrees(180) });
    expect(pixelAt(renderer, WIDTH / 2, HEIGHT / 2).b).toBeGreaterThan(BRIGHT);
    renderer.setView({ ...DEFAULT_VIEW, pitch: degrees(90) });
    const up = pixelAt(renderer, WIDTH / 2, HEIGHT / 2);
    expect(up.r).toBeGreaterThan(MIXED);
    expect(up.b).toBeGreaterThan(MIXED);
  });

  it('renders the little-planet projection with lens 0 in the middle', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'stereographic' });
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, WIDTH / 2, HEIGHT / 2).r).toBeGreaterThan(BRIGHT);
  });

  it('silences a lens through its gain so the other can be inspected alone', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    presentRedAndBlue(renderer);
    renderer.setLensGain(0, [0, 0, 0]);
    const seam = pixelAt(renderer, SEAM_COLUMN - 1, HEIGHT / 2);
    expect(seam.r).toBeLessThan(DIM);
    expect(seam.b).toBeGreaterThan(FAINT);
  });

  it('clamps the view it is given', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, pitch: degrees(200), fieldOfView: degrees(10) });
    expect(renderer.view).toEqual({ ...DEFAULT_VIEW, pitch: 90, fieldOfView: 30 });
  });
});
