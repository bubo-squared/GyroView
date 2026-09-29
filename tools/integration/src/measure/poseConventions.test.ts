import { degrees, multiplyMatrices, type LensCalibration, type Matrix3 } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import {
  bandPixels,
  conePixels,
  turnRegistering,
  type ComparedPixels,
  type LineMinimum,
} from './support/lensRegistration';
import {
  everySignFlip,
  flippedLensRotation,
  opticalAxisOf,
  predictedRelativeTurn,
  type BodyAxis,
  type BodyTurn,
  type SignFlips,
} from './support/poseConventions';
import { openSample } from '../browser/realRecordingSupport';
import {
  alignToReference,
  FAR_FIELD_BAND,
  renderUnder,
  rotationOf,
  type LockedRendering,
  type RowBand,
  type ViewTurn,
} from './support/referenceAlignment';
import {
  greyCanvasOf,
  REFERENCE_PANORAMA_SIZE,
  STUDIO_CLIPS,
  type GreyImage,
} from './support/referenceFrames';
import { calibrationOf } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import { quartilesOf, type Quartiles } from './support/statistics';
import { openStudioFrame } from './support/studioFrame';

const FRAME_TIMEOUT_MS = 300_000;
const AXES: readonly BodyAxis[] = ['x', 'y', 'z'];
/**
 * Turns about the other two axes are read near each lens's axis, where parallax vanishes, on
 * both sides of the horizon.
 */
const CENTRE_BAND: RowBand = { top: 0.15, bottom: 0.56 };
const CENTRE_HALF_ANGLE = degrees(35);
const AS_READ: SignFlips = { yaw: false, pitch: false, roll: false };
/**
 * The frame whose stitch is saved beside the measurement, for the eye.
 */
const SAVED_STITCH_SECONDS = 100;

type LensPair<Value> = readonly [Value, Value];

interface AxisResult {
  /**
   * The back lens's turn about the axis less the front lens's: zero when the core's reading
   * registers both lenses alike on the reference.
   */
  readonly relative: number;
  readonly lenses: LensPair<LineMinimum>;
}

interface Registration {
  readonly reference: GreyImage;
  readonly rendering: LockedRendering;
  readonly poses: LensPair<Matrix3>;
  /**
   * The view turn that puts the whole stitch on the reference.
   */
  readonly view: ViewTurn;
  /**
   * A turn about the lens axis is read on the whole band above the horizon, the far field the
   * alignment compares too: it moves the picture around the seam ring, which no parallax does.
   */
  readonly upperBand: ComparedPixels;
}

function lensesOf(calibration: readonly LensCalibration[]): LensPair<LensCalibration> {
  const [first, second] = calibration.toSorted((a, b) => a.lensIndex - b.lensIndex);
  if (!first || !second) throw new Error('two lenses expected');
  return [first, second];
}

function posesOf(lenses: LensPair<LensCalibration>, flips: LensPair<SignFlips>): LensPair<Matrix3> {
  return [flippedLensRotation(lenses[0], flips[0]), flippedLensRotation(lenses[1], flips[1])];
}

function comparedFor(
  registration: Registration,
  search: { axis: BodyAxis; lensIndex: number },
): ComparedPixels {
  const nearLensAxis = (): ComparedPixels =>
    conePixels(REFERENCE_PANORAMA_SIZE, {
      viewToBody: multiplyMatrices(registration.rendering.lock, rotationOf(registration.view)),
      axis: opticalAxisOf(registration.poses[search.lensIndex === 0 ? 0 : 1]),
      halfAngle: CENTRE_HALF_ANGLE,
      band: CENTRE_BAND,
    });
  return search.axis === 'z' ? registration.upperBand : nearLensAxis();
}

function relativeAbout(registration: Registration, axis: BodyAxis): AxisResult {
  const [front, back] = [0, 1].map((lensIndex) =>
    turnRegistering(registration.reference, registration.rendering, {
      lensIndex,
      pose: registration.poses[lensIndex === 0 ? 0 : 1],
      view: registration.view,
      axis,
      compared: comparedFor(registration, { axis, lensIndex }),
    }),
  );
  if (!front || !back) throw new Error('two lenses expected');
  return { relative: back.at - front.at, lenses: [front, back] };
}

type TurnSummary = Quartiles & { readonly values: readonly number[] };

/**
 * The median and quartiles of the relative turns about each axis over the frames.
 */
function summaryOfTurns(
  relativeTurns: ReadonlyMap<BodyAxis, readonly number[]>,
): Readonly<Record<BodyAxis, TurnSummary>> {
  const about = (axis: BodyAxis): TurnSummary => {
    const values = relativeTurns.get(axis) ?? [];
    return { values, ...quartilesOf(values) };
  };
  return { x: about('x'), y: about('y'), z: about('z') };
}

/**
 * Every reading of the calibration angles' signs, per lens, by how far the relative turn it
 * predicts under the core's reading lies from the one measured.
 */
function rankedReadings(lenses: LensPair<LensCalibration>, measured: BodyTurn): object[] {
  const core = posesOf(lenses, [AS_READ, AS_READ]);
  return everySignFlip()
    .flatMap((front) => everySignFlip().map((back) => [front, back] as const))
    .map((flips) => {
      const predicted = predictedRelativeTurn(core, posesOf(lenses, flips));
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
 * Each lens registered alone on Insta360 Studio's stitch of a recording by a turn about each
 * body axis, drawn under the core's reading of the calibration, on frames spread over the clip:
 * under the reading that is the camera's, both lenses need the same turns. The turn about the
 * lens axis is read on the whole upper band, the other two near each lens's axis, so parallax
 * spoils none of them; near oblique edges (a mast, a door frame) still can, so the median over
 * the frames decides, and a frame whose search pins at its range is left out for that axis.
 * From the medians, the relative turn every other reading of the signs would leave predicts
 * which reading is the camera's (ADR 0025).
 */
for (const clip of STUDIO_CLIPS) {
  describe(`the lens pose against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];
    const relativeTurns = new Map<BodyAxis, number[]>(AXES.map((axis) => [axis, []]));

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    for (const frame of clip.frames) {
      it(
        `registers each lens about each axis on the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const studio = await openStudioFrame(context, { clip, frame, cleanups });
          const poses = posesOf(lensesOf(calibrationOf(studio.opened).lenses), [AS_READ, AS_READ]);
          const view = alignToReference(studio.reference, studio.rendering).turn;
          const registration: Registration = {
            reference: studio.reference,
            rendering: studio.rendering,
            poses,
            view,
            upperBand: bandPixels(REFERENCE_PANORAMA_SIZE, FAR_FIELD_BAND),
          };
          const prefix = `${clip.slug}-${frame.time}s`;
          if (frame.time === SAVED_STITCH_SECONDS) {
            await saveRender(`${prefix}-stitch`, greyCanvasOf(renderUnder(studio.rendering, view)));
          }
          const about = Object.fromEntries(
            AXES.map((axis) => [axis, relativeAbout(registration, axis)]),
          ) as Record<BodyAxis, AxisResult>;
          for (const axis of AXES) {
            if (about[axis].lenses.some((lens) => lens.isAtBoundary)) continue;
            relativeTurns.get(axis)?.push(about[axis].relative);
          }
          await saveMeasurement(`${prefix}-lens-turns`, about);
          expect(Object.keys(about)).toHaveLength(AXES.length);
        },
        FRAME_TIMEOUT_MS,
      );
    }

    it('summarises the turns over the frames and ranks every reading of the signs', async (context) => {
      if (AXES.every((axis) => (relativeTurns.get(axis) ?? []).length === 0)) {
        context.skip('no frame was registered');
      }
      const opened = await openSample(context, clip.sample);
      cleanups.push(() => {
        opened.dispose();
      });
      const summary = summaryOfTurns(relativeTurns);
      const measured = { x: summary.x.median, y: summary.y.median, z: summary.z.median };
      const ranked = rankedReadings(lensesOf(calibrationOf(opened).lenses), measured);
      await saveMeasurement(`${clip.slug}-lens-turn-conventions`, { summary, measured, ranked });
      expect(Number.isFinite(measured.z)).toBe(true);
    });
  });
}
