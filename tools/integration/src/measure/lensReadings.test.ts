import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import {
  drawnRadialScaleOf,
  EXTENDED_MEI,
  readingsOf,
  setupOf,
  termReadingsOf,
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
import { harmonicsOf, quartilesOf, type Harmonics } from './support/statistics';
import { openStudioMoment, type StudioMoment } from './support/studioFrame';

/**
 * Every reading at each of its radial scales, a dozen on an X5 and more with a v6 string's term
 * readings, each aligned and its seam measured: several minutes a frame.
 */
const FRAME_TIMEOUT_MS = 600_000;

function trustedDisparities(seam: MeasuredDisparity): number[] {
  return seam.bins.filter((bin) => bin.isTrusted).map((bin) => bin.disparity);
}

/**
 * The far bins' disparity as it varies around the seam: a term read wrong leaves a pattern once
 * or twice a turn, a wrong radial scale shifts every azimuth alike.
 */
function disparityHarmonicsOf(seam: MeasuredDisparity): Harmonics {
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
  const extended = scores.filter((score) => score.reading === EXTENDED_MEI);
  return extended.toSorted((left, right) => left.cost - right.cost)[0]?.radialScale;
}

/**
 * How a score names its reading: the reading, its scale on top of the core's (what the v6 term
 * readings are tried at), and the scale it draws at, which ADR 0023 reports.
 */
function labelOf(reading: LensReading): {
  readonly reading: string;
  readonly radialScale: number;
  readonly drawnRadialScale: number;
} {
  return {
    reading: reading.name,
    radialScale: reading.radialScale,
    drawnRadialScale: drawnRadialScaleOf(reading),
  };
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
): Promise<Alignment & { readonly seamDisparity: object; readonly seamHarmonics: Harmonics }> {
  const { canvas, renderer, dispose } = labRenderingOfSetup(
    setupOf(candidate, studio.opened),
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
          const [first, ...others] = readingsOf(studio.opened);
          if (!first) throw new Error('the recording carries no calibration reading');
          const firstScore = await scoreOf(studio, first, alignFully);
          const scores = [{ ...labelOf(first), ...firstScore }];
          const scoreNear = async (candidate: LensReading): Promise<void> => {
            const score = await scoreOf(studio, candidate, alignNear(firstScore.turn));
            scores.push({ ...labelOf(candidate), ...score });
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
