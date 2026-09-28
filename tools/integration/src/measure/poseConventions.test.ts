import {
  multiplyMatrices,
  stabilizerFor,
  type LensCalibration,
  type Matrix3,
  type PoseDelta,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import {
  bandPixels,
  conePixels,
  turnRegistering,
  type ComparedPixels,
  type LineMinimum,
  type RowBand,
} from '../browser/lensRegistration';
import {
  everySignFlip,
  flippedLensRotation,
  opticalAxisOf,
  predictedRelativeTurn,
  type BodyAxis,
  type BodyTurn,
  type SignFlips,
} from '../browser/poseConventions';
import { openSample } from '../browser/realRecordingSupport';
import {
  alignToReference,
  renderUnder,
  rotationOf,
  type Renderable,
} from '../browser/referenceAlignment';
import {
  loadGreyImage,
  recordingTimeOf,
  STUDIO_SAILING_SPREAD,
  type GreyImage,
} from '../browser/referenceFrames';
import { calibrationOf, equirectangularRendering, motionOf } from '../browser/rendering';
import { isServed, SAILING_8K_30 } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const FRAME_TIMEOUT_MS = 900_000;
const AXES: readonly BodyAxis[] = ['x', 'y', 'z'];
/**
 * A turn about the lens axis is read on the sky band above the boat, whole: it moves the picture
 * around the seam ring, which no parallax does.
 */
const SKY_BAND: RowBand = { top: 0.15, bottom: 0.5 };
/**
 * Turns about the other two axes are read near each lens's axis, where parallax vanishes, on
 * both sides of the horizon.
 */
const CENTRE_BAND: RowBand = { top: 0.15, bottom: 0.56 };
const CENTRE_HALF_ANGLE = 35;
const AS_READ: SignFlips = { yaw: false, pitch: false, roll: false };
const ROLL_FLIPPED: SignFlips = { yaw: false, pitch: false, roll: true };
const YAW_FLIPPED: SignFlips = { yaw: true, pitch: false, roll: false };
const PITCH_FLIPPED: SignFlips = { yaw: false, pitch: true, roll: false };
const YAW_AND_ROLL_FLIPPED: SignFlips = { yaw: true, pitch: false, roll: true };
const QUARTER = 0.25;
const HALF = 0.5;
const THREE_QUARTERS = 0.75;
/**
 * The frames whose whole stitch is saved under each reading, for the eye.
 */
const SAVED_STITCHES = new Set([55, 100, 145]);

type LensPair<Value> = readonly [Value, Value];

/**
 * A reading of the calibration angles' signs, per lens, against the core's.
 */
interface Convention {
  readonly name: string;
  readonly slug: string;
  readonly flips: LensPair<SignFlips>;
}

const CORE: Convention = { name: 'as the core reads it', slug: 'core', flips: [AS_READ, AS_READ] };
const CONVENTIONS: readonly Convention[] = [
  CORE,
  // The reading before ADR 0025: the roll as written, the back lens's yaw in the other sense.
  {
    name: 'before ADR 0025',
    slug: 'before',
    flips: [ROLL_FLIPPED, YAW_AND_ROLL_FLIPPED],
  },
  { name: 'roll as written', slug: 'roll-as-written', flips: [ROLL_FLIPPED, ROLL_FLIPPED] },
  { name: 'back lens yaw as before', slug: 'back-yaw-before', flips: [AS_READ, YAW_FLIPPED] },
  // The y-up/y-down mirror that reverses the roll would reverse the pitch as well.
  { name: 'pitch mirrored too', slug: 'pitch-mirrored', flips: [PITCH_FLIPPED, PITCH_FLIPPED] },
];

interface AxisResult {
  /**
   * The back lens's turn about the axis less the front lens's: zero when the reading registers
   * both lenses alike on the reference.
   */
  readonly relative: number;
  readonly lenses: LensPair<LineMinimum>;
}

interface ConventionResult {
  readonly name: string;
  readonly slug: string;
  /**
   * The whole stitch under the reading, turned onto the reference.
   */
  readonly stitch: HTMLCanvasElement;
  readonly about: Readonly<Record<BodyAxis, AxisResult>>;
  /**
   * What the relative turn under the core's reading would be, were this reading the camera's.
   */
  readonly predictedUnderCore: BodyTurn;
}

/**
 * Every usable frame's relative turn, by reading and axis: `<name>:<axis>`.
 */
const results = new Map<string, number[]>();

function lensesOf(calibration: readonly LensCalibration[]): LensPair<LensCalibration> {
  const [first, second] = calibration.toSorted((a, b) => a.lensIndex - b.lensIndex);
  if (!first || !second) throw new Error('two lenses expected');
  return [first, second];
}

function posesOf(lenses: LensPair<LensCalibration>, flips: LensPair<SignFlips>): LensPair<Matrix3> {
  return [flippedLensRotation(lenses[0], flips[0]), flippedLensRotation(lenses[1], flips[1])];
}

interface Registration {
  readonly reference: GreyImage;
  readonly renderable: Renderable;
  readonly lenses: LensPair<LensCalibration>;
  readonly skyBand: ComparedPixels;
}

/**
 * The poses a reading draws with, and the view turn that puts the whole stitch on the reference.
 */
interface Drawing {
  readonly poses: LensPair<Matrix3>;
  readonly view: PoseDelta;
}

function comparedFor(
  registration: Registration,
  drawing: Drawing,
  search: { axis: BodyAxis; lensIndex: number },
): ComparedPixels {
  if (search.axis === 'z') return registration.skyBand;
  const { renderable } = registration;
  return conePixels(PANORAMA_SIZE, {
    viewToBody: multiplyMatrices(renderable.lock, rotationOf(drawing.view)),
    axis: opticalAxisOf(drawing.poses[search.lensIndex === 0 ? 0 : 1]),
    halfAngle: CENTRE_HALF_ANGLE,
    band: CENTRE_BAND,
  });
}

function relativeAbout(registration: Registration, drawing: Drawing, axis: BodyAxis): AxisResult {
  const [front, back] = [0, 1].map((lensIndex) =>
    turnRegistering(registration.reference, registration.renderable, {
      lensIndex,
      pose: drawing.poses[lensIndex === 0 ? 0 : 1],
      view: drawing.view,
      axis,
      compared: comparedFor(registration, drawing, { axis, lensIndex }),
    }),
  );
  if (!front || !back) throw new Error('two lenses expected');
  return { relative: back.at - front.at, lenses: [front, back] };
}

/**
 * Draws with the reading's poses, turns the whole stitch onto the reference, then registers
 * each lens alone about each body axis.
 */
function measureConvention(registration: Registration, convention: Convention): ConventionResult {
  const { reference, renderable, lenses } = registration;
  const poses = posesOf(lenses, convention.flips);
  for (const [lensIndex, pose] of poses.entries()) renderable.renderer.setLensPose(lensIndex, pose);
  const drawing: Drawing = { poses, view: alignToReference(reference, renderable).rotation };
  renderUnder(renderable, drawing.view);
  const stitch = copyOf(renderable.canvas);
  const [x, y, z] = AXES.map((axis) => relativeAbout(registration, drawing, axis));
  if (!x || !y || !z) throw new Error('three axes expected');
  return {
    name: convention.name,
    slug: convention.slug,
    stitch,
    about: { x, y, z },
    predictedUnderCore: predictedRelativeTurn(posesOf(lenses, CORE.flips), poses),
  };
}

/**
 * A 2D copy of what the canvas shows now: the next render overwrites the WebGL canvas.
 */
function copyOf(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d')?.drawImage(canvas, 0, 0);
  return copy;
}

function withoutStitch(result: ConventionResult): Omit<ConventionResult, 'stitch'> {
  const { name, slug, about, predictedUnderCore } = result;
  return { name, slug, about, predictedUnderCore };
}

async function saveStitches(measured: readonly ConventionResult[], time: number): Promise<void> {
  for (const result of measured) {
    await saveRender(`sailing-${time}s-stitch-${result.slug}`, result.stitch);
  }
}

function record(measured: readonly ConventionResult[]): void {
  for (const result of measured) recordConvention(result);
}

function recordConvention(result: ConventionResult): void {
  for (const axis of AXES) {
    const { relative, lenses } = result.about[axis];
    if (lenses.some((lens) => lens.isAtBoundary)) continue;
    const key = `${result.name}:${axis}`;
    results.set(key, [...(results.get(key) ?? []), relative]);
  }
}

/**
 * The value at fraction `at` of the sorted values, between neighbours linearly.
 */
function quantileOf(sorted: readonly number[], at: number): number {
  const position = at * (sorted.length - 1);
  const below = sorted[Math.floor(position)] ?? NaN;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

/**
 * The median and quartiles: a few frames spoiled by near objects move neither.
 */
function summaryOf(values: readonly number[]): { median: number; lower: number; upper: number } {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    median: quantileOf(sorted, HALF),
    lower: quantileOf(sorted, QUARTER),
    upper: quantileOf(sorted, THREE_QUARTERS),
  };
}

function medianTurnOf(name: string): BodyTurn {
  const median = (axis: BodyAxis): number => summaryOf(results.get(`${name}:${axis}`) ?? []).median;
  return { x: median('x'), y: median('y'), z: median('z') };
}

/**
 * Every per-lens reading of the signs, by how far what it predicts under the core's reading lies
 * from what was measured.
 */
function rankedReadings(lenses: LensPair<LensCalibration>, measured: BodyTurn): object[] {
  const today = posesOf(lenses, CORE.flips);
  return everySignFlip()
    .flatMap((front) => everySignFlip().map((back) => [front, back] as const))
    .map((flips) => {
      const predicted = predictedRelativeTurn(today, posesOf(lenses, flips));
      const distance = Math.hypot(
        predicted.x - measured.x,
        predicted.y - measured.y,
        predicted.z - measured.z,
      );
      return { flips, predicted, distance };
    })
    .toSorted((a, b) => a.distance - b.distance);
}

/**
 * Each lens registered alone on Insta360 Studio's stitch of the sailing recording by a turn
 * about each body axis, on frames spread over the clip: under the reading of the calibration
 * angles that is the camera's, both lenses need the same turns. The turn about the lens axis is
 * read on the whole sky band, the other two near each lens's axis, so parallax spoils none of
 * them; near oblique edges (the mast, the rigging) still can, so the median over the frames
 * decides, and a frame whose search pins at its range is left out for that axis.
 */
describe('the lens pose conventions against the Studio export of the sailing recording', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  for (const frame of STUDIO_SAILING_SPREAD) {
    it(
      `registers each lens about each axis on the Studio frame at ${frame.time} s`,
      async (context) => {
        if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
        const reference = await loadGreyImage(frame.url);
        const opened = await openSample(context, SAILING_8K_30);
        cleanups.push(() => {
          opened.dispose();
        });
        const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
        cleanups.push(dispose);
        const moment = await decodeMoment(opened, recordingTimeOf(frame));
        cleanups.push(() => {
          closeMoment(moment);
        });
        const pair = moment.first;
        const lock = stabilizerFor('lock').nextRotation(
          motionOf(opened).orientations.orientationAt(pair.timestamp),
          pair.timestamp,
        );
        const registration: Registration = {
          reference,
          renderable: { renderer, canvas, pair, lock },
          lenses: lensesOf(calibrationOf(opened).lenses),
          skyBand: bandPixels(PANORAMA_SIZE, SKY_BAND),
        };
        const measured = CONVENTIONS.map((convention) =>
          measureConvention(registration, convention),
        );
        record(measured);
        if (SAVED_STITCHES.has(frame.time)) await saveStitches(measured, frame.time);
        await saveMeasurement(
          `sailing-${frame.time}s-lens-turns`,
          measured.map((result) => withoutStitch(result)),
        );
        expect(measured).toHaveLength(CONVENTIONS.length);
      },
      FRAME_TIMEOUT_MS,
    );
  }

  it('summarises each reading over the frames and ranks every reading of the signs', async (context) => {
    if (results.size === 0) context.skip('no frame was registered');
    const opened = await openSample(context, SAILING_8K_30);
    cleanups.push(() => {
      opened.dispose();
    });
    const summary = [...results].map(([key, values]) => ({ key, values, ...summaryOf(values) }));
    const measured = medianTurnOf(CORE.name);
    const ranked = rankedReadings(lensesOf(calibrationOf(opened).lenses), measured);
    await saveMeasurement('sailing-lens-turn-conventions', { summary, measured, ranked });
    expect(summary.length).toBeGreaterThan(0);
  });
});
