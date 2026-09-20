import {
  buildStitchingSetup,
  CalibrationVersion,
  DEFAULT_HALF_FIELD_OF_VIEW,
  DEFAULT_VIEW,
  degrees,
  EquidistantModel,
  equirectangularPixelOf,
  FULL_FRAME,
  LEFT_HALF,
  lensRotation,
  LockStabilization,
  parseOffsetString,
  quaternionFromAxisAngle,
  radians,
  RIGHT_HALF,
  seconds,
  transformVector,
  type CalibrationSet,
  type DecodedFrame,
  type LensLayout,
  type Presentation,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const WIDTH = 64;
const HEIGHT = 32;
const SIZE = { width: WIDTH, height: HEIGHT };
const SQUARE = 1000;
const HALF_SQUARE = 500;
const BRIGHT = 200;
const DIM = 40;
const MIXED = 60;
/**
 * Just before and after the yaw-90 seam the two lens weights swap; the fainter lens still shows.
 */
const FAINT = 15;
const RGBA = 4;
const GRADIENT_SIZE = 256;
/**
 * A colour channel encodes a canvas coordinate in 256 steps; the parity check allows two.
 */
const GRADIENT_TOLERANCE = 2 / 255;
const X5_CROP = {
  sensorWidth: 5376,
  sensorHeight: 5376,
  cropWidth: 5312,
  cropHeight: 5312,
  cropOffsetX: 0,
  cropOffsetY: 0,
};
/**
 * The office X5 calibration (ADR 0005): two Mei lenses on a 10752 x 5376 canvas.
 */
const OFFICE_MEI =
  '2_2.000000_4296.660_4295.450_2689.890_2681.940_-0.002_0.377_90.524_0.000000_0.000000_0.000000_0.18113680_2.16784811_-3.49636626_-0.00016818_-0.00010206_10752_5376_113_2.000000_4281.830_4282.190_8082.100_2679.470_0.289_0.043_89.987_-0.000907_-0.000055_-0.032061_0.18382449_2.06260586_-3.21479726_0.00075291_0.00063732_10752_5376_113_197632';

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

const PACKED: LensLayout = {
  kind: 'packed',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: LEFT_HALF },
    { lensIndex: 1, inputIndex: 0, trackIndex: 0, region: RIGHT_HALF },
  ],
  evidence: [],
};

function frameOf(
  paint: (context: CanvasRenderingContext2D, size: number) => void,
  size = WIDTH,
): DecodedFrame<VideoFrame> {
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const context = source.getContext('2d');
  if (!context) throw new Error('no 2d context');
  paint(context, size);
  const frame = new VideoFrame(source, { timestamp: 0 });
  return {
    timestamp: seconds(0),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}

function solidFrame(fillStyle: string): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    context.fillStyle = fillStyle;
    context.fillRect(0, 0, size, size);
  });
}

function halvesFrame(left: string, right: string): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    context.fillStyle = left;
    context.fillRect(0, 0, size / 2, size);
    context.fillStyle = right;
    context.fillRect(size / 2, 0, size / 2, size);
  });
}

/**
 * Red encodes the frame's x, green its y, so a sampled colour tells which frame pixel was read.
 */
function gradientFrame(): DecodedFrame<VideoFrame> {
  return frameOf((context, size) => {
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * RGBA;
        image.data[offset] = x;
        image.data[offset + 1] = y;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, GRADIENT_SIZE);
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Position {
  readonly column: number;
  readonly row: number;
}

const CENTRE: Position = { column: WIDTH / 2, row: HEIGHT / 2 };
const RIGHT_EDGE: Position = { column: WIDTH - 1, row: HEIGHT / 2 };

function pixelAt(renderer: ThreeFrameRenderer, position: Position, size = SIZE): Rgb {
  const pixels = renderer.readPixels();
  const row = size.height - 1 - position.row;
  const offset = (row * size.width + position.column) * RGBA;
  return { r: pixels[offset] ?? -1, g: pixels[offset + 1] ?? -1, b: pixels[offset + 2] ?? -1 };
}

function eventOnce(target: EventTarget, name: string): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener(
      name,
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

function afterNextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function pixelTowards(renderer: ThreeFrameRenderer, direction: Vector3, size = SIZE): Rgb {
  return pixelAt(renderer, equirectangularPixelOf(direction, size), size);
}

describe('ThreeFrameRenderer', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  function open(setup?: StitchingSetup, size = SIZE): ThreeFrameRenderer {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const stitching =
      setup ??
      buildStitchingSetup({
        calibration: syntheticCalibration(),
        layout: MULTI_TRACK,
        windowCrop: undefined,
      });
    const renderer = ThreeFrameRenderer.create(canvas, stitching, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    return renderer;
  }

  function present(renderer: ThreeFrameRenderer, pair: DecodedFrame<VideoFrame>[]): void {
    frames.push(...pair);
    const presentation: Presentation<VideoFrame> = {
      pair: { timestamp: seconds(0), frames: pair },
      mediaTime: seconds(0),
      frameIndex: undefined,
    };
    renderer.present(presentation);
  }

  function presentRedAndBlue(renderer: ThreeFrameRenderer): void {
    present(renderer, [solidFrame('#ff0000'), solidFrame('#0000ff')]);
  }

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('shows lens 0 straight ahead, lens 1 behind, and swaps the lenses across the seam in an equirectangular view', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    presentRedAndBlue(renderer);
    const ahead = pixelTowards(renderer, [0, 0, 1]);
    expect(ahead.r).toBeGreaterThan(BRIGHT);
    expect(ahead.b).toBeLessThan(DIM);
    const behind = pixelTowards(renderer, [0, 0, -1]);
    expect(behind.b).toBeGreaterThan(BRIGHT);
    expect(behind.r).toBeLessThan(DIM);
    const seam = equirectangularPixelOf([1, 0, 0], SIZE);
    const justBeforeSeam = pixelAt(renderer, { column: seam.column - 1, row: seam.row });
    const justAfterSeam = pixelAt(renderer, seam);
    expect(justBeforeSeam.r).toBeGreaterThan(BRIGHT);
    expect(justBeforeSeam.b).toBeGreaterThan(FAINT);
    expect(justAfterSeam.b).toBeGreaterThan(BRIGHT);
    expect(justAfterSeam.r).toBeGreaterThan(FAINT);
  });

  it('follows the view: yaw turns to the other lens and looking straight up hits the seam', () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    renderer.setView({ ...DEFAULT_VIEW, yaw: degrees(180) });
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
    renderer.setView({ ...DEFAULT_VIEW, pitch: degrees(90) });
    const up = pixelAt(renderer, CENTRE);
    expect(up.r).toBeGreaterThan(MIXED);
    expect(up.b).toBeGreaterThan(MIXED);
  });

  it('gives the little planet a real horizontal field of view: 90 degrees stays within lens 0, 180 reaches the seam at the edge', () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    renderer.setView({ ...DEFAULT_VIEW, projection: 'stereographic', fieldOfView: degrees(90) });
    expect(pixelAt(renderer, RIGHT_EDGE).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, RIGHT_EDGE).b).toBeLessThan(DIM);
    renderer.setView({ ...DEFAULT_VIEW, projection: 'stereographic', fieldOfView: degrees(180) });
    const edge = pixelAt(renderer, RIGHT_EDGE);
    expect(edge.r).toBeGreaterThan(FAINT);
    expect(edge.b).toBeGreaterThan(FAINT);
    renderer.setView({ ...DEFAULT_VIEW, projection: 'stereographic', fieldOfView: degrees(300) });
    expect(pixelAt(renderer, RIGHT_EDGE).b).toBeGreaterThan(BRIGHT);
  });

  it('silences a lens through its gain so the other can be inspected alone', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    presentRedAndBlue(renderer);
    renderer.setLensGain(0, [0, 0, 0]);
    const seam = equirectangularPixelOf([1, 0, 0], SIZE);
    const beforeSeam = pixelAt(renderer, { column: seam.column - 1, row: seam.row });
    expect(beforeSeam.r).toBeLessThan(DIM);
    expect(beforeSeam.b).toBeGreaterThan(FAINT);
  });

  it('applies a lock stabilization: a camera turned around shows lens 1 ahead', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    const turnedAround = quaternionFromAxisAngle([0, 1, 0], radians(Math.PI));
    renderer.setStabilization(new LockStabilization().rotationFor(turnedAround));
    presentRedAndBlue(renderer);
    expect(pixelTowards(renderer, [0, 0, 1]).b).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).r).toBeGreaterThan(BRIGHT);
  });

  it('applies a lock stabilization: a camera pointing at the sky shows lens 0 at the zenith', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    const pointingUp = quaternionFromAxisAngle([1, 0, 0], radians(Math.PI / 2));
    renderer.setStabilization(new LockStabilization().rotationFor(pointingUp));
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: 0 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT - 1 }).b).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT / 2 - 1 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
  });

  it('draws both halves of a packed frame as the two lenses', () => {
    const renderer = open(
      buildStitchingSetup({
        calibration: syntheticCalibration(),
        layout: PACKED,
        windowCrop: undefined,
      }),
    );
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    present(renderer, [halvesFrame('#ff0000', '#0000ff')]);
    expect(pixelTowards(renderer, [0, 0, 1]).r).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).b).toBeGreaterThan(BRIGHT);
  });

  it('samples a Mei lens within its sensor window exactly where the core model projects', () => {
    const calibration = parseOffsetString(OFFICE_MEI);
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK, windowCrop: X5_CROP });
    const size = { width: 512, height: 256 };
    const renderer = open(setup, size);
    renderer.setView({ ...DEFAULT_VIEW, projection: 'equirectangular' });
    present(renderer, [gradientFrame(), solidFrame('#000000')]);
    const [lens] = setup.lenses;
    const [calibrated] = calibration.lenses;
    if (!lens || !calibrated) throw new Error('no lens');
    for (const [yaw, pitch] of [
      [0, 0],
      [40, 10],
      [-55, -25],
      [20, 60],
      [-70, 5],
    ] as const) {
      const yawRad = (yaw * Math.PI) / 180;
      const pitchRad = (pitch * Math.PI) / 180;
      const body: Vector3 = [
        Math.sin(yawRad) * Math.cos(pitchRad),
        -Math.sin(pitchRad),
        Math.cos(yawRad) * Math.cos(pitchRad),
      ];
      const probe = equirectangularPixelOf(body, size);
      const sampled = pixelAt(renderer, probe, size);
      const expected = calibrated.model.project(transformVector(lensRotation(calibrated), body));
      if (!expected) throw new Error('direction outside lens 0');
      const u = (expected.x - lens.window.x) / lens.window.width;
      const v = (expected.y - lens.window.y) / lens.window.height;
      expect(Math.abs(sampled.r / 255 - u)).toBeLessThan(GRADIENT_TOLERANCE + 1 / GRADIENT_SIZE);
      expect(Math.abs(sampled.g / 255 - v)).toBeLessThan(GRADIENT_TOLERANCE + 1 / GRADIENT_SIZE);
    }
  });

  it('resizes its drawing buffer and keeps the picture', () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    renderer.resize(128, 64);
    expect(renderer.readPixels()).toHaveLength(128 * 64 * RGBA);
    expect(
      pixelAt(renderer, { column: 64, row: 32 }, { width: 128, height: 64 }).r,
    ).toBeGreaterThan(BRIGHT);
  });

  it('survives a lost context: it draws nothing until fresh frames arrive after the restore', async () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    const canvas = canvases.at(-1);
    const gl = canvas?.getContext('webgl2');
    const loser = gl?.getExtension('WEBGL_lose_context');
    if (!canvas || !loser) throw new Error('WEBGL_lose_context is unavailable');
    const lost = eventOnce(canvas, 'webglcontextlost');
    loser.loseContext();
    await lost;
    renderer.setView({ ...DEFAULT_VIEW, yaw: degrees(180) });
    // Browsers finish handling the loss in a later task; a restore requested from the loss
    // event's own continuation is ignored and `webglcontextrestored` never fires.
    await afterNextTask();
    const restored = eventOnce(canvas, 'webglcontextrestored');
    loser.restoreContext();
    await restored;
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
  });

  it('clamps the view it is given and refuses to work once disposed', () => {
    const renderer = open();
    renderer.setView({ ...DEFAULT_VIEW, pitch: degrees(200), fieldOfView: degrees(10) });
    expect(renderer.view).toEqual({ ...DEFAULT_VIEW, pitch: 90, fieldOfView: 30 });
    renderer.dispose();
    expect(() => {
      renderer.setView(DEFAULT_VIEW);
    }).toThrow(/disposed/u);
  });

  it('refuses a pair that does not match the lens textures', () => {
    const renderer = open();
    expect(() => {
      present(renderer, [solidFrame('#ff0000')]);
    }).toThrow(/does not fit/u);
  });
});
