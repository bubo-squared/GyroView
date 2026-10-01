import {
  DEFAULT_FRAMING,
  DEFAULT_VIEW,
  degrees,
  degreesToRadians,
  GainMatchingFrameSink,
  lensRotation,
  MAX_MAGNIFICATION,
  quaternionFromAxisAngle,
  radians,
  seconds,
  stabilizerFor,
  transformVector,
  type CalibrationSet,
  type DecodedFrame,
  type Framing,
  type FrameSink,
  type MeiDistortion,
  type Presentation,
  type StitchingSetup,
  type Vector3,
  type ViewState,
} from '@gyroview/core';
import { equirectangularPixelOf, MeiModel, parseOffsetString } from '@gyroview/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DRAW_AT_ONCE, type DrawSchedule } from './drawSchedules';
import { readPixels } from './test/readPixels';
import {
  gradientFrame,
  GRADIENT_SIZE,
  halvesFrame,
  solidFrame,
  stripesFrame,
} from './test/syntheticFrames';
import {
  PACKED,
  MULTI_TRACK,
  setupAsRecorded,
  syntheticMeiCalibration,
} from './test/syntheticStitching';
import { ThreeFrameRenderer } from './ThreeFrameRenderer';

/**
 * The normal view looking as given, the flat pictures fitted.
 */
function framingOf(view: ViewState): Framing {
  return { ...DEFAULT_FRAMING, view };
}

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
/**
 * The finest stripes average to the middle grey; a block reads even when its levels stay
 * within this much of each other.
 */
const GREY = 128;
const EVEN = 24;
const BLOCK_SIDE = 8;
const RGBA = 4;
/**
 * A colour channel encodes a canvas coordinate in 256 steps; the parity check allows two.
 */
const GRADIENT_TOLERANCE = 2 / 255;
/**
 * The office X5 calibration (ADR 0005): two Mei lenses on a 10752 x 5376 canvas.
 */
const OFFICE_MEI =
  '2_2.000000_4296.660_4295.450_2689.890_2681.940_-0.002_0.377_90.524_0.000000_0.000000_0.000000_0.18113680_2.16784811_-3.49636626_-0.00016818_-0.00010206_10752_5376_113_2.000000_4281.830_4282.190_8082.100_2679.470_0.289_0.043_89.987_-0.000907_-0.000055_-0.032061_0.18382449_2.06260586_-3.21479726_0.00075291_0.00063732_10752_5376_113_197632';

const NO_DISTORTION: MeiDistortion = { radial: [], tangential: [], thinPrism: [] };

/**
 * Yaw and pitch, in degrees, of directions lens 0 images, spread over its field out to 91 degrees
 * from its axis, where the distortion's higher orders tell.
 */
const PROBES_ON_LENS_ZERO = [
  [0, 0],
  [40, 10],
  [-55, -25],
  [20, 60],
  [-70, 5],
  [-60, -60],
  [88, 25],
  [91, 0],
] as const;

function bodyDirectionAt(yawDegrees: number, pitchDegrees: number): Vector3 {
  const yaw = degreesToRadians(degrees(yawDegrees));
  const pitch = degreesToRadians(degrees(pitchDegrees));
  return [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

const UNITY_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];

/**
 * One exaggerated Mei term at a time, each sized to move the farthest probe some sixty-five
 * canvas pixels, five times the parity tolerance: a term the shader reads with the wrong sign,
 * order or partner draws the sample more than the tolerance away.
 */
const RADIAL_TERMS = [0.66, 2.5, 10, 38, 150];
const TANGENTIAL_PAIRS = [
  { p1: 0.34, p2: 0.12 },
  { p1: 1.3, p2: 0.45 },
];
const THIN_PRISM_TERMS = [0.34, 1.3];
const NO_PAIRS = TANGENTIAL_PAIRS.map(() => ({ p1: 0, p2: 0 }));
const NO_PRISM = THIN_PRISM_TERMS.map(() => ({ x: 0, y: 0 }));

function onlyAt<Term>(order: number, term: Term, zeros: readonly Term[]): Term[] {
  return zeros.map((zero, index) => (index === order ? term : zero));
}

const ONE_TERM_DISTORTIONS: readonly (readonly [string, MeiDistortion])[] = [
  ...RADIAL_TERMS.map((term, order): [string, MeiDistortion] => [
    `radial term k${order + 1}`,
    {
      ...NO_DISTORTION,
      radial: onlyAt(
        order,
        term,
        RADIAL_TERMS.map(() => 0),
      ),
    },
  ]),
  ...TANGENTIAL_PAIRS.flatMap(({ p1, p2 }, order): [string, MeiDistortion][] => [
    [
      `tangential p1 of order ${order}`,
      { ...NO_DISTORTION, tangential: onlyAt(order, { p1, p2: 0 }, NO_PAIRS) },
    ],
    [
      `tangential p2 of order ${order}`,
      { ...NO_DISTORTION, tangential: onlyAt(order, { p1: 0, p2 }, NO_PAIRS) },
    ],
  ]),
  ...THIN_PRISM_TERMS.flatMap((term, order): [string, MeiDistortion][] => [
    [
      `thin-prism x of order ${order}`,
      { ...NO_DISTORTION, thinPrism: onlyAt(order, { x: term, y: 0 }, NO_PRISM) },
    ],
    [
      `thin-prism y of order ${order}`,
      { ...NO_DISTORTION, thinPrism: onlyAt(order, { x: 0, y: term }, NO_PRISM) },
    ],
  ]),
];

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

/**
 * The canvas each renderer of a test draws on, where its pixels are read.
 */
const canvasOf = new Map<ThreeFrameRenderer, HTMLCanvasElement>();

function pixelsOf(renderer: ThreeFrameRenderer): Uint8ClampedArray {
  const canvas = canvasOf.get(renderer);
  if (!canvas) throw new Error('the renderer was not opened by this test');
  return readPixels(canvas);
}

function pixelAt(renderer: ThreeFrameRenderer, position: Position, size = SIZE): Rgb {
  const pixels = pixelsOf(renderer);
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

interface BlockStats {
  readonly mean: number;
  readonly spread: number;
}

/**
 * The red channel over a square block of pixels centred on a position: its mean and its range.
 */
function blockStats(renderer: ThreeFrameRenderer, centre: Position, side: number): BlockStats {
  const levels: number[] = [];
  for (let row = centre.row - side / 2; row < centre.row + side / 2; row += 1) {
    for (let column = centre.column - side / 2; column < centre.column + side / 2; column += 1) {
      levels.push(pixelAt(renderer, { column, row }).r);
    }
  }
  const mean = levels.reduce((total, level) => total + level, 0) / levels.length;
  return { mean, spread: Math.max(...levels) - Math.min(...levels) };
}

/**
 * A draw schedule that holds the draw asked for until the test draws it.
 */
class HeldDraws implements DrawSchedule {
  private pending: (() => void) | undefined;

  public get isPending(): boolean {
    return this.pending !== undefined;
  }

  public request(draw: () => void): void {
    this.pending = draw;
  }

  public cancel(): void {
    this.pending = undefined;
  }

  public drawPending(): void {
    const draw = this.pending;
    this.pending = undefined;
    draw?.();
  }
}

describe('ThreeFrameRenderer', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const gainMatchers: GainMatchingFrameSink<VideoFrame>[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  function open(
    setup?: StitchingSetup,
    size = SIZE,
    drawSchedule: DrawSchedule = DRAW_AT_ONCE,
  ): ThreeFrameRenderer {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const stitching = setup ?? setupAsRecorded(MULTI_TRACK);
    const renderer = ThreeFrameRenderer.create(canvas, stitching, {
      preserveDrawingBuffer: true,
      drawSchedule,
    });
    renderers.push(renderer);
    canvasOf.set(renderer, canvas);
    return renderer;
  }

  /**
   * Gain matching composed over the renderer as the player composes it, measuring its seam.
   */
  function gainMatchingOver(renderer: ThreeFrameRenderer): GainMatchingFrameSink<VideoFrame> {
    const matching = new GainMatchingFrameSink(renderer, renderer);
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

  /**
   * Draws lens 0 of a Mei calibration over a gradient, lens 1 silenced so lens 0 alone fills the
   * feather band, and holds each probe's sampled texel to the frame position the core model
   * projects the probe's direction to, at the setup's radial scale.
   */
  function expectLensZeroSampledWhereTheSetupDrawsIt(calibration: CalibrationSet): void {
    const setup = setupAsRecorded(MULTI_TRACK, calibration);
    const size = { width: 512, height: 256 };
    const renderer = open(setup, size);
    renderer.setViewMode('equirectangular');
    renderer.setLensGains([UNITY_GAIN, SILENCED]);
    present(renderer, [gradientFrame(), solidFrame('#000000')]);
    const [lens] = setup.lenses;
    const [calibrated] = calibration.lenses;
    if (!calibrated || lens?.projection.kind !== 'mei') throw new Error('no Mei lens');
    const drawnModel = new MeiModel(lens.projection);
    for (const [yaw, pitch] of PROBES_ON_LENS_ZERO) {
      const body = bodyDirectionAt(yaw, pitch);
      const sampled = pixelAt(renderer, equirectangularPixelOf(body, size), size);
      const expected = drawnModel.project(transformVector(lensRotation(calibrated), body));
      if (!expected) throw new Error('direction outside lens 0');
      const u = (expected.x - lens.window.x) / lens.window.width;
      const v = (expected.y - lens.window.y) / lens.window.height;
      expect(Math.abs(sampled.r / 255 - u)).toBeLessThan(GRADIENT_TOLERANCE + 1 / GRADIENT_SIZE);
      expect(Math.abs(sampled.g / 255 - v)).toBeLessThan(GRADIENT_TOLERANCE + 1 / GRADIENT_SIZE);
    }
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
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, yaw: degrees(180) }));
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, pitch: degrees(90) }));
    const up = pixelAt(renderer, CENTRE);
    expect(up.r).toBeGreaterThan(MIXED);
    expect(up.b).toBeGreaterThan(MIXED);
  });

  it('gives the normal view a real horizontal field of view: turned 60 degrees with 60 across, its right edge meets the seam', () => {
    const renderer = open();
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, fieldOfView: degrees(120) }));
    expect(pixelAt(renderer, RIGHT_EDGE).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, RIGHT_EDGE).b).toBeLessThan(DIM);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, yaw: degrees(60), fieldOfView: degrees(60) }));
    const edge = pixelAt(renderer, RIGHT_EDGE);
    expect(edge.r).toBeGreaterThan(FAINT);
    expect(edge.b).toBeGreaterThan(FAINT);
  });

  it('keeps the equirectangular panorama level: pitch is ignored, yaw picks the centre', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, pitch: degrees(90) }));
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, CENTRE).b).toBeLessThan(DIM);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, yaw: degrees(180) }));
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

  it('fills the letterbox bars with a magnified panorama', () => {
    const size = { width: 64, height: 36 };
    const renderer = open(undefined, size);
    renderer.setViewMode('equirectangular');
    presentRedAndBlue(renderer);
    renderer.setFraming({
      ...DEFAULT_FRAMING,
      panorama: { scale: MAX_MAGNIFICATION, centre: { x: 0.5, y: 0.5 } },
    });
    for (const row of [0, 1, 34, 35]) {
      const edge = pixelAt(renderer, { column: 32, row }, size);
      expect(edge.r + edge.g + edge.b).toBeGreaterThan(FAINT);
    }
  });

  it('magnifies the raw lens tiles together: at twice the size the left lens fills the view', () => {
    const renderer = open();
    renderer.setViewMode('raw-lenses');
    presentRedAndBlue(renderer);
    renderer.setFraming({ ...DEFAULT_FRAMING, lenses: { scale: 2, centre: { x: 0.25, y: 0.5 } } });
    for (const column of [2, 32, 61]) {
      const shown = pixelAt(renderer, { column, row: 16 });
      expect(shown.r).toBeGreaterThan(BRIGHT);
      expect(shown.b).toBeLessThan(DIM);
    }
  });

  it('shows the raw lenses side by side and unstitched: no pose, stabilization or gain', () => {
    const renderer = open();
    renderer.setViewMode('raw-lenses');
    const turnedAround = quaternionFromAxisAngle([0, 1, 0], radians(Math.PI));
    renderer.setStabilization(stabilizerFor('lock').nextRotation(turnedAround, seconds(0)));
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
    const renderer = open(setupAsRecorded(PACKED));
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

  it('silences a lens through its gain and leaves the feather band to the other, unfaded', () => {
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
    expect(beforeSeam.b).toBeGreaterThan(BRIGHT);
    // Where only the silenced lens sees, nothing shows.
    const ahead = pixelAt(renderer, equirectangularPixelOf([0, 0, 1], SIZE));
    expect(ahead.r).toBeLessThan(DIM);
    expect(ahead.b).toBeLessThan(DIM);
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
    const renderer = open(setupAsRecorded(PACKED));
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
    renderer.setStabilization(stabilizerFor('lock').nextRotation(turnedAround, seconds(0)));
    presentRedAndBlue(renderer);
    expect(pixelTowards(renderer, [0, 0, 1]).b).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).r).toBeGreaterThan(BRIGHT);
  });

  it('applies a lock stabilization: a camera pointing at the sky shows lens 0 at the zenith', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    const pointingUp = quaternionFromAxisAngle([1, 0, 0], radians(Math.PI / 2));
    renderer.setStabilization(stabilizerFor('lock').nextRotation(pointingUp, seconds(0)));
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: 0 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT - 1 }).b).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, { column: WIDTH / 2, row: HEIGHT / 2 - 1 }).r).toBeGreaterThan(BRIGHT);
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
  });

  it('draws both halves of a packed frame as the two lenses', () => {
    const renderer = open(setupAsRecorded(PACKED));
    renderer.setViewMode('equirectangular');
    present(renderer, [halvesFrame('#ff0000', '#0000ff')]);
    expect(pixelTowards(renderer, [0, 0, 1]).r).toBeGreaterThan(BRIGHT);
    expect(pixelTowards(renderer, [0, 0, -1]).b).toBeGreaterThan(BRIGHT);
  });

  it('samples a Mei lens within its canvas square exactly where the core model projects', () => {
    expectLensZeroSampledWhereTheSetupDrawsIt(parseOffsetString(OFFICE_MEI));
  });

  it('samples a Mei lens drawn at a radial scale where the scaled model projects', () => {
    // Exaggerated: a tenth further out moves the farthest probe some forty canvas pixels.
    expectLensZeroSampledWhereTheSetupDrawsIt({
      ...parseOffsetString(OFFICE_MEI),
      radialScale: 1.1,
    });
  });

  for (const [term, distortion] of ONE_TERM_DISTORTIONS) {
    it(`samples a Mei lens with its ${term} alone where the core model projects`, () => {
      expectLensZeroSampledWhereTheSetupDrawsIt(syntheticMeiCalibration(distortion));
    });
  }

  it('averages the finest stripes toward grey where the panorama minifies them, in balanced and high quality', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    present(renderer, [stripesFrame(), solidFrame('#000000')]);
    for (const quality of ['balanced', 'high'] as const) {
      renderer.setQuality(quality);
      const { mean, spread } = blockStats(renderer, CENTRE, BLOCK_SIDE);
      expect(Math.abs(mean - GREY)).toBeLessThan(EVEN);
      expect(spread).toBeLessThan(EVEN);
    }
  });

  it('lets the finest stripes alias in fast quality: one tap lands anywhere between black and white', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    renderer.setQuality('fast');
    present(renderer, [stripesFrame(), solidFrame('#000000')]);
    expect(blockStats(renderer, CENTRE, BLOCK_SIDE).spread).toBeGreaterThan(MIXED);
  });

  it('builds the mip chain of the frames standing on screen when the quality asks for one', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    renderer.setQuality('fast');
    present(renderer, [stripesFrame(), solidFrame('#000000')]);
    renderer.setQuality('balanced');
    const { mean, spread } = blockStats(renderer, CENTRE, BLOCK_SIDE);
    expect(Math.abs(mean - GREY)).toBeLessThan(EVEN);
    expect(spread).toBeLessThan(EVEN);
  });

  it('keeps a solid colour exact through every quality, on the frames standing on screen', () => {
    const renderer = open();
    renderer.setViewMode('equirectangular');
    present(renderer, [solidFrame(`rgb(${GREY}, ${GREY}, ${GREY})`), solidFrame('#000000')]);
    for (const quality of ['fast', 'high', 'balanced'] as const) {
      renderer.setQuality(quality);
      expect(Math.abs(pixelAt(renderer, CENTRE).r - GREY)).toBeLessThanOrEqual(1);
    }
  });

  it('does not bleed the other half of a packed frame across the raw tiles’ inner edge', () => {
    const size = { width: 256, height: 128 };
    const renderer = open(setupAsRecorded(PACKED), size);
    renderer.setViewMode('raw-lenses');
    present(renderer, [halvesFrame('#ff0000', '#0000ff')]);
    const lastOfLeftTile = pixelAt(
      renderer,
      { column: size.width / 2 - 1, row: size.height / 2 },
      size,
    );
    const firstOfRightTile = pixelAt(
      renderer,
      { column: size.width / 2, row: size.height / 2 },
      size,
    );
    expect(lastOfLeftTile.r).toBeGreaterThan(BRIGHT);
    expect(lastOfLeftTile.b).toBeLessThan(DIM);
    expect(firstOfRightTile.b).toBeGreaterThan(BRIGHT);
    expect(firstOfRightTile.r).toBeLessThan(DIM);
  });

  it('resizes its drawing buffer and keeps the picture', () => {
    const renderer = open();
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    renderer.resize({ width: 128, height: 64 });
    expect(pixelsOf(renderer)).toHaveLength(128 * 64 * RGBA);
    expect(
      pixelAt(renderer, { column: 64, row: 32 }, { width: 128, height: 64 }).r,
    ).toBeGreaterThan(BRIGHT);
  });

  it('draws a change of view when its schedule says, and a presented pair at once, leaving the schedule nothing to draw', () => {
    const schedule = new HeldDraws();
    const renderer = open(undefined, SIZE, schedule);
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, yaw: degrees(180) }));
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    schedule.drawPending();
    expect(pixelAt(renderer, CENTRE).b).toBeGreaterThan(BRIGHT);
    renderer.setFraming(framingOf(DEFAULT_VIEW));
    presentRedAndBlue(renderer);
    expect(pixelAt(renderer, CENTRE).r).toBeGreaterThan(BRIGHT);
    expect(schedule.isPending).toBe(false);
  });

  it('draws a new size at once whatever its schedule, since the resized canvas is blank', () => {
    const schedule = new HeldDraws();
    const renderer = open(undefined, SIZE, schedule);
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    renderer.resize({ width: 128, height: 64 });
    expect(
      pixelAt(renderer, { column: 64, row: 32 }, { width: 128, height: 64 }).r,
    ).toBeGreaterThan(BRIGHT);
    expect(schedule.isPending).toBe(false);
  });

  it('draws the standing frame again once a lost context is restored', async () => {
    const renderer = open();
    renderer.setViewMode('normal');
    presentRedAndBlue(renderer);
    const canvas = canvases.at(-1);
    const gl = canvas?.getContext('webgl2');
    const loser = gl?.getExtension('WEBGL_lose_context');
    if (!canvas || !loser) throw new Error('WEBGL_lose_context is unavailable');
    const lost = eventOnce(canvas, 'webglcontextlost');
    loser.loseContext();
    await lost;
    renderer.setFraming(framingOf({ ...DEFAULT_VIEW, yaw: degrees(180) }));
    // Browsers finish handling the loss in a later task; a restore requested from the loss
    // event's own continuation is ignored and `webglcontextrestored` never fires.
    await afterNextTask();
    const restored = eventOnce(canvas, 'webglcontextrestored');
    loser.restoreContext();
    await restored;
    // The pair on screen stays open until the next one comes: a paused picture redraws from it.
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
      renderer.setFraming(framingOf(DEFAULT_VIEW));
    }).toThrow(/disposed/u);
  });

  it('refuses a shader the GPU will not link when created, not at the first frame, and says why', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    canvases.push(canvas);
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('this browser has no WebGL2 context');
    const parameterOf = gl.getProgramParameter.bind(gl);
    gl.getProgramParameter = (program: WebGLProgram, name: number): unknown =>
      name === gl.LINK_STATUS ? false : parameterOf(program, name);
    gl.getProgramInfoLog = (): string => 'too many uniforms';
    const setup = setupAsRecorded(MULTI_TRACK);
    expect(() => ThreeFrameRenderer.create(canvas, setup)).toThrow(
      expect.objectContaining({
        code: 'render-unavailable',
        message: expect.stringContaining('too many uniforms') as unknown,
      }),
    );
  });

  it('refuses a seam meter shader the GPU will not link when created, not when gain matching starts', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    canvases.push(canvas);
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('this browser has no WebGL2 context');
    const parameterOf = gl.getProgramParameter.bind(gl);
    const isSeamAnalysis = (program: WebGLProgram): boolean =>
      (gl.getAttachedShaders(program) ?? []).some((shader) =>
        (gl.getShaderSource(shader) ?? '').includes('inLensZero'),
      );
    gl.getProgramParameter = (program: WebGLProgram, name: number): unknown =>
      name === gl.LINK_STATUS && isSeamAnalysis(program) ? false : parameterOf(program, name);
    const setup = setupAsRecorded(MULTI_TRACK);
    expect(() => ThreeFrameRenderer.create(canvas, setup)).toThrow(
      expect.objectContaining({ code: 'render-unavailable' }),
    );
  });

  it('refuses a layout with more decoded frames than the shader samples', () => {
    const setup = setupAsRecorded(MULTI_TRACK);
    expect(() => open({ ...setup, frameSlotCount: 3 })).toThrow(
      expect.objectContaining({ code: 'unsupported-layout' }),
    );
  });

  it('refuses a pair that does not match the lens textures', () => {
    const renderer = open();
    expect(() => {
      present(renderer, [solidFrame('#ff0000')]);
    }).toThrow(/does not fit/u);
  });
});
