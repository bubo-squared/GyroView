import {
  buildStitchingSetup,
  DEFAULT_VIEW,
  degrees,
  GainMatchingFrameSink,
  lensRotation,
  LockStabilization,
  quaternionFromAxisAngle,
  radians,
  seconds,
  transformVector,
  type DecodedFrame,
  type FrameSink,
  type Presentation,
  type StitchingSetup,
  type Vector3,
} from '@gyroview/core';
import { equirectangularPixelOf, parseOffsetString } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { MULTI_TRACK, PACKED, syntheticCalibration } from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

const WIDTH = 64;
const HEIGHT = 32;
const SIZE = { width: WIDTH, height: HEIGHT };
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
/**
 * The office X5 calibration (ADR 0005): two Mei lenses on a 10752 x 5376 canvas.
 */
const OFFICE_MEI =
  '2_2.000000_4296.660_4295.450_2689.890_2681.940_-0.002_0.377_90.524_0.000000_0.000000_0.000000_0.18113680_2.16784811_-3.49636626_-0.00016818_-0.00010206_10752_5376_113_2.000000_4281.830_4282.190_8082.100_2679.470_0.289_0.043_89.987_-0.000907_-0.000055_-0.032061_0.18382449_2.06260586_-3.21479726_0.00075291_0.00063732_10752_5376_113_197632';

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

/**
 * Both synthetic layouts, like every X-series camera, have two lenses.
 */
const LENS_COUNT = 2;

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
  const gainMatchers: GainMatchingFrameSink<VideoFrame>[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  function open(setup?: StitchingSetup, size = SIZE): ThreeFrameRenderer {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const stitching =
      setup ?? buildStitchingSetup({ calibration: syntheticCalibration(), layout: MULTI_TRACK });
    const renderer = ThreeFrameRenderer.create(canvas, stitching, { preserveDrawingBuffer: true });
    renderers.push(renderer);
    return renderer;
  }

  /**
   * Gain matching composed over the renderer as the player composes it, measuring its seam.
   */
  function gainMatchingOver(renderer: ThreeFrameRenderer): GainMatchingFrameSink<VideoFrame> {
    const matching = new GainMatchingFrameSink({ sink: renderer, renderer, lensCount: LENS_COUNT });
    gainMatchers.push(matching);
    return matching;
  }

  function present(sink: FrameSink<VideoFrame>, pair: DecodedFrame<VideoFrame>[]): void {
    frames.push(...pair);
    const presentation: Presentation<VideoFrame> = {
      pair: { timestamp: seconds(0), frames: pair },
      mediaTime: seconds(0),
    };
    sink.present(presentation);
  }

  function presentRedAndBlue(renderer: ThreeFrameRenderer): void {
    present(renderer, [solidFrame('#ff0000'), solidFrame('#0000ff')]);
  }

  afterEach(() => {
    for (const matching of gainMatchers.splice(0)) matching.dispose();
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('shows lens 0 straight ahead and lens 1 behind in an equirectangular view', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    const ahead = pixelTowards(renderer, [0, 0, 1]);
    expect(ahead.r).toBeGreaterThan(BRIGHT);
    expect(ahead.b).toBeLessThan(DIM);
    const behind = pixelTowards(renderer, [0, 0, -1]);
    expect(behind.b).toBeGreaterThan(BRIGHT);
    expect(behind.r).toBeLessThan(DIM);
  });

  it('swaps the lenses across the seam, the fainter one still showing', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
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

  it('gives the normal view a real horizontal field of view: turned 60 degrees with 60 across, its right edge meets the seam', () => {
    const renderer = open();
    presentRedAndBlue(renderer);
    renderer.setView({ ...DEFAULT_VIEW, fieldOfView: degrees(120) });
    expect(pixelAt(renderer, RIGHT_EDGE).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, RIGHT_EDGE).b).toBeLessThan(DIM);
    renderer.setView({ ...DEFAULT_VIEW, yaw: degrees(60), fieldOfView: degrees(60) });
    const edge = pixelAt(renderer, RIGHT_EDGE);
    expect(edge.r).toBeGreaterThan(FAINT);
    expect(edge.b).toBeGreaterThan(FAINT);
  });

  it('keeps the equirectangular panorama level: pitch is ignored, yaw picks the centre', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    renderer.setView({ ...DEFAULT_VIEW, pitch: degrees(90) });
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, CENTRE).b).toBeLessThan(DIM);
    renderer.setView({ ...DEFAULT_VIEW, yaw: degrees(180) });
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
  });

  it('letterboxes the equirectangular panorama to 2:1 on a wider-than-tall viewport', () => {
    const size = { width: 64, height: 36 };
    const renderer = open(undefined, size);
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    for (const row of [0, 1, 34, 35]) {
      const bar = pixelAt(renderer, { column: 32, row }, size);
      expect(bar.r + bar.g + bar.b).toBe(0);
    }
    const zenith = pixelAt(renderer, { column: 32, row: 2 }, size);
    expect(zenith.r).toBeGreaterThan(FAINT);
    expect(zenith.b).toBeGreaterThan(FAINT);
    expect(pixelAt(renderer, { column: 32, row: 18 }, size).r).toBeGreaterThan(BRIGHT);
  });

  it('shows the raw lenses side by side and unstitched: no pose, stabilization or gain', () => {
    const renderer = open();
    renderer.setViewMode('raw-lenses');
    const turnedAround = quaternionFromAxisAngle([0, 1, 0], radians(Math.PI));
    renderer.setStabilization(new LockStabilization().nextRotation(turnedAround));
    renderer.setLensGains([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, { column: 16, row: 16 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: 48, row: 16 }).b).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: 48, row: 16 }).r).toBeLessThan(DIM);
  });

  it('draws each raw lens image as decoded, its top-left corner at the top-left of its tile', () => {
    const renderer = open();
    renderer.setViewMode('raw-lenses');
    present(renderer, [gradientFrame(), solidFrame('#000000')]);
    const topLeft = pixelAt(renderer, { column: 1, row: 1 });
    const topRight = pixelAt(renderer, { column: 30, row: 1 });
    const bottomLeft = pixelAt(renderer, { column: 1, row: 30 });
    expect([topLeft.r, topLeft.g].every((value) => value < DIM)).toBe(true);
    expect(topRight.r).toBeGreaterThan(BRIGHT);
    expect(topRight.g).toBeLessThan(DIM);
    expect(bottomLeft.r).toBeLessThan(DIM);
    expect(bottomLeft.g).toBeGreaterThan(BRIGHT);
  });

  it('shows the halves of a packed frame as the two raw lens tiles', () => {
    const renderer = open(
      buildStitchingSetup({ calibration: syntheticCalibration(), layout: PACKED }),
    );
    renderer.setViewMode('raw-lenses');
    present(renderer, [halvesFrame('#ff0000', '#0000ff')]);
    expect(pixelAt(renderer, { column: 16, row: 16 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: 16, row: 16 }).b).toBeLessThan(DIM);
    expect(pixelAt(renderer, { column: 48, row: 16 }).b).toBeGreaterThan(BRIGHT);
  });

  it('stacks the raw lens tiles on a portrait viewport with black bars around them', () => {
    const size = { width: 32, height: 72 };
    const renderer = open(undefined, size);
    renderer.setViewMode('raw-lenses');
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, { column: 16, row: 20 }, size).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: 16, row: 52 }, size).b).toBeGreaterThan(BRIGHT);
    for (const row of [0, 71]) {
      const bar = pixelAt(renderer, { column: 16, row }, size);
      expect(bar.r + bar.g + bar.b).toBe(0);
    }
  });

  it('goes back to the stitched view when the mode returns to normal', () => {
    const renderer = open();
    renderer.setViewMode('raw-lenses');
    presentRedAndBlue(renderer);
    renderer.setViewMode('normal');
    expect(pixelAt(renderer, { column: 48, row: 16 }).r).toBeGreaterThan(BRIGHT);
  });

  it('silences a lens through its gain so the other can be inspected alone', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    renderer.setLensGains([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    const seam = equirectangularPixelOf([1, 0, 0], SIZE);
    const beforeSeam = pixelAt(renderer, { column: seam.column - 1, row: seam.row });
    expect(beforeSeam.r).toBeLessThan(DIM);
    expect(beforeSeam.b).toBeGreaterThan(FAINT);
  });

  it('refuses a gain for a lens the setup does not have', () => {
    const renderer = open();
    expect(() => {
      renderer.setLensGains([
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]);
    }).toThrow(expect.objectContaining({ code: 'index-out-of-range' }));
  });

  it('matches the darker lens to the brighter one along the seam when gain matching is on', async () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    const matching = gainMatchingOver(renderer);
    matching.enable();
    present(matching, [solidFrame('rgb(200, 200, 200)'), solidFrame('rgb(100, 100, 100)')]);
    expect(pixelTowards(renderer, [0, 0, -1]).g).toBeLessThan(110);

    await matching.matchNow();

    expect(pixelTowards(renderer, [0, 0, -1]).g).toBeGreaterThan(190);
    expect(pixelTowards(renderer, [0, 0, 1]).g).toBeGreaterThan(190);
    expect(pixelTowards(renderer, [0, 0, 1]).g).toBeLessThan(210);
  });

  it('matches both lenses of a packed frame, which share one texture', async () => {
    const renderer = open(
      buildStitchingSetup({ calibration: syntheticCalibration(), layout: PACKED }),
    );
    renderer.setViewMode('equirectangular');
    const matching = gainMatchingOver(renderer);
    matching.enable();
    present(matching, [halvesFrame('rgb(200, 200, 200)', 'rgb(100, 100, 100)')]);
    await matching.matchNow();
    expect(pixelTowards(renderer, [0, 0, -1]).g).toBeGreaterThan(190);
  });

  it('applies a lock stabilization: a camera turned around shows lens 1 ahead', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    const turnedAround = quaternionFromAxisAngle([0, 1, 0], radians(Math.PI));
    renderer.setStabilization(new LockStabilization().nextRotation(turnedAround));
    presentRedAndBlue(renderer);
    expect(pixelTowards(renderer, [0, 0, 1]).b).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).r).toBeGreaterThan(BRIGHT);
  });

  it('applies a lock stabilization: a camera pointing at the sky shows lens 0 at the zenith', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    const pointingUp = quaternionFromAxisAngle([1, 0, 0], radians(Math.PI / 2));
    renderer.setStabilization(new LockStabilization().nextRotation(pointingUp));
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: 0 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT - 1 }).b).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT / 2 - 1 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
  });

  it('draws both halves of a packed frame as the two lenses', () => {
    const renderer = open(
      buildStitchingSetup({ calibration: syntheticCalibration(), layout: PACKED }),
    );
    renderer.setViewMode('equirectangular');
    present(renderer, [halvesFrame('#ff0000', '#0000ff')]);
    expect(pixelTowards(renderer, [0, 0, 1]).r).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).b).toBeGreaterThan(BRIGHT);
  });

  it('samples a Mei lens within its canvas square exactly where the core model projects', () => {
    const calibration = parseOffsetString(OFFICE_MEI);
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const size = { width: 512, height: 256 };
    const renderer = open(setup, size);
    renderer.setViewMode('equirectangular');
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

  it('takes the seam meters still in use with it when disposed; they measure nothing after', async () => {
    const renderer = open();
    const meter = renderer.createSeamMeter();
    renderer.dispose();
    await expect(meter.measure()).resolves.toBeUndefined();
  });

  it('refuses to work once disposed', () => {
    const renderer = open();
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
