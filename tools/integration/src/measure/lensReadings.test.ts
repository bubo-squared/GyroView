import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import {
  readingsOf,
  setupOf,
  termReadingsOf,
  withRadialScale,
  type LensReading,
} from './support/lensReadings';
import {
  alignToReference,
  refineAlignment,
  type Alignment,
  type LockedRendering,
  type ViewTurn,
} from './support/referenceAlignment';
import { REFERENCE_PANORAMA_SIZE, STUDIO_CLIPS } from './support/referenceFrames';
import { isServed } from '../browser/sampleUrls';
import { labRenderingOfSetup } from './support/labRendering';
import { matchedGains, measuredDisparity, type MeasuredDisparity } from './support/seamJoins';
import { harmonicsOf, quartilesOf } from './support/statistics';
import { openStudioMoment, type StudioMoment } from './support/studioFrame';

/**
 * The radial scales tried on each reading, against the reading as the core reads it: the legacy
 * radius at 96 to 98 degrees for the equidistant model, both Mei readings up to the Mei model's
 * best on the two X5 units (ADR 0023); the polynomial reading, a fallback, as it is.
 */
const RADIAL_SCALES: Readonly<Record<string, readonly number[]>> = {
  equidistant: [1, 0.99, 0.98],
  mei: [1, 1.02, 1.04],
  'extended-mei': [0.98, 1, 1.02, 1.04, 1.06],
  polynomial: [1],
};
/**
 * Seven candidates, each aligned and its seam measured, take about half a minute per frame; a
 * recording with a v6 string adds its term readings.
 */
const FRAME_TIMEOUT_MS = 600_000;
const EXTENDED_MEI_AT = 'extended-mei@';

function candidatesOf(readings: readonly LensReading[]): LensReading[] {
  return readings.flatMap((reading) =>
    (RADIAL_SCALES[reading.name] ?? [1]).map((scale) => withRadialScale(reading, scale)),
  );
}

function trustedDisparities(seam: MeasuredDisparity): number[] {
  return seam.bins.filter((bin) => bin.isTrusted).map((bin) => bin.disparity);
}

/**
 * The far bins' disparity as it varies around the seam: a term read wrong leaves a pattern once
 * or twice a turn, a wrong radial scale shifts every azimuth alike.
 */
function disparityHarmonicsOf(seam: MeasuredDisparity): object {
  const trusted = seam.bins.filter((bin) => bin.isTrusted);
  return harmonicsOf(trusted.map((bin) => ({ azimuth: bin.azimuth, value: bin.disparity })));
}

/**
 * The radial scale at which the v6 reading fits the reference best: where its term readings
 * are compared, since a term read wrong is judged at the scale that is right.
 */
function bestScaleOf(
  scores: readonly {
    readonly reading: string;
    readonly radialScale: number;
    readonly cost: number;
  }[],
): number | undefined {
  const extended = scores.filter((score) => score.reading.startsWith(EXTENDED_MEI_AT));
  return extended.toSorted((left, right) => left.cost - right.cost)[0]?.radialScale;
}

type Aligner = (studio: StudioMoment, rendering: LockedRendering) => Alignment;

const alignFully: Aligner = (studio, rendering) => alignToReference(studio.reference, rendering);

/**
 * Aligns from a turn already close: the first reading's, since readings differ in scale, not in
 * pose.
 */
function alignNear(turn: ViewTurn): Aligner {
  return (studio, rendering) => refineAlignment(studio.reference, rendering, turn);
}

/**
 * The reading drawn, turned onto the reference, with the disparity it leaves at the seam.
 */
async function scoreOf(
  studio: StudioMoment,
  candidate: LensReading,
  align: Aligner,
): Promise<Alignment & { readonly seamDisparity: object; readonly seamHarmonics: object }> {
  const { canvas, renderer, dispose } = labRenderingOfSetup(
    setupOf(candidate, studio.opened.layout),
    REFERENCE_PANORAMA_SIZE,
  );
  try {
    const rendering = { renderer, canvas, pair: studio.moment.first, lock: studio.lock };
    const alignment = align(studio, rendering);
    const seam = await measuredDisparity(renderer, await matchedGains(renderer));
    return {
      ...alignment,
      seamDisparity: quartilesOf(trustedDisparities(seam)),
      seamHarmonics: disparityHarmonicsOf(seam),
    };
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

    const compared = clip.frames.filter((frame) => clip.comparedTimes.includes(frame.time));
    for (const frame of compared) {
      it(
        `scores every reading and radial scale on the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const studio = await openStudioMoment(context, { clip, frame, cleanups });
          const [first, ...others] = candidatesOf(readingsOf(studio.opened));
          if (!first) throw new Error('the recording carries no calibration reading');
          const firstScore = await scoreOf(studio, first, alignFully);
          const scores = [{ reading: first.name, radialScale: first.radialScale, ...firstScore }];
          const scoreNear = async (candidate: LensReading): Promise<void> => {
            const score = await scoreOf(studio, candidate, alignNear(firstScore.turn));
            scores.push({ reading: candidate.name, radialScale: candidate.radialScale, ...score });
          };
          for (const candidate of others) await scoreNear(candidate);
          const best = bestScaleOf(scores);
          if (best !== undefined) {
            for (const candidate of termReadingsOf(studio.opened, best)) await scoreNear(candidate);
          }
          await saveMeasurement(`${clip.slug}-${frame.time}s-lens-readings`, { scores });
          expect(scores.every((score) => Number.isFinite(score.cost))).toBe(true);
        },
        FRAME_TIMEOUT_MS,
      );
    }
  });
}
