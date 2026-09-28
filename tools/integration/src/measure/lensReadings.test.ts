import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { readingsOf, setupOf, withRadialScale, type LensReading } from '../browser/lensReadings';
import {
  alignToReference,
  refineAlignment,
  type Alignment,
  type ViewTurn,
} from '../browser/referenceAlignment';
import { REFERENCE_PANORAMA_SIZE, STUDIO_CLIPS } from '../browser/referenceFrames';
import { renderingOfSetup } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import { matchedGains, measuredDisparity, type MeasuredDisparity } from '../browser/seamJoins';
import { quartilesOf } from '../browser/statistics';
import { openStudioMoment, type StudioMoment } from '../browser/studioFrame';

const COMPARED_TIMES = new Set([55, 100, 175]);
/**
 * The radial scales tried on each reading, against the reading as the core reads it: the legacy
 * radius at 96 to 98 degrees for the equidistant model, the Mei model up to its best on the two
 * X5 units (ADR 0023); the polynomial reading, a fallback, as it is.
 */
const RADIAL_SCALES: Readonly<Record<string, readonly number[]>> = {
  equidistant: [1, 0.99, 0.98],
  mei: [1, 1.02, 1.04],
  polynomial: [1],
};
/**
 * Nine candidates, each aligned and its seam measured, take about half a minute per frame.
 */
const FRAME_TIMEOUT_MS = 300_000;

function candidatesOf(readings: readonly LensReading[]): LensReading[] {
  return readings.flatMap((reading) =>
    (RADIAL_SCALES[reading.name] ?? [1]).map((scale) => withRadialScale(reading, scale)),
  );
}

function trustedDisparities(seam: MeasuredDisparity): number[] {
  return seam.bins.filter((bin) => bin.isTrusted).map((bin) => bin.disparity);
}

/**
 * The reading drawn, turned onto the reference (from the first reading's turn, which lies
 * close), with the disparity it leaves at the seam.
 */
async function scoreOf(
  studio: StudioMoment,
  candidate: LensReading,
  near: ViewTurn | undefined,
): Promise<Alignment & { readonly seamDisparity: object }> {
  const { canvas, renderer, dispose } = renderingOfSetup(
    setupOf(candidate, studio.opened.layout),
    REFERENCE_PANORAMA_SIZE,
  );
  try {
    const rendering = { renderer, canvas, pair: studio.moment.first, lock: studio.lock };
    const alignment =
      near === undefined
        ? alignToReference(studio.reference, rendering)
        : refineAlignment(studio.reference, rendering, near);
    const seam = await measuredDisparity(renderer, await matchedGains(renderer));
    return { ...alignment, seamDisparity: quartilesOf(trustedDisparities(seam)) };
  } finally {
    dispose();
  }
}

/**
 * Which reading of the calibration, at which radial scale, draws the far field where Insta360
 * Studio draws it, and how far apart it draws the two lenses' images at the seam: parallax only
 * ever moves them apart, so the disparity of the far bins, the lower quartile, is the reading's
 * own error there, and needs no reference (ADR 0023).
 */
for (const clip of STUDIO_CLIPS) {
  describe(`lens readings against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    const compared = clip.frames.filter((frame) => COMPARED_TIMES.has(frame.time));
    for (const frame of compared) {
      it(
        `scores every reading and radial scale on the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const studio = await openStudioMoment(context, { clip, frame, cleanups });
          const scores = [];
          let near: ViewTurn | undefined;
          const candidates = candidatesOf(readingsOf(studio.opened));
          for (const candidate of candidates) {
            const score = await scoreOf(studio, candidate, near);
            near ??= score.turn;
            scores.push({ reading: candidate.name, radialScale: candidate.radialScale, ...score });
          }
          await saveMeasurement(`${clip.slug}-${frame.time}s-lens-readings`, { scores });
          expect(scores.every((score) => Number.isFinite(score.cost))).toBe(true);
        },
        FRAME_TIMEOUT_MS,
      );
    }
  });
}
