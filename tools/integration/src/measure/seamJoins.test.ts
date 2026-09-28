import {
  DecodePipeline,
  degrees,
  easedDisparities,
  FIXED_SEAM,
  SEAM_MAX_BEND,
  IDENTITY_MATRIX3,
  multiplyMatrices,
  seconds,
  stabilizerFor,
  type Degrees,
  type FramePair,
  type Matrix3,
  type PoseDelta,
  type SeamJoin,
  type Vector3,
} from '@gyroview/core';
import { DECODE_PIPELINE_OPTIONS, type OpenedRecording } from '@gyroview/player/composition';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { closeAll, openSample, port, takePairs } from '../browser/realRecordingSupport';
import {
  alignToReference,
  renderUnder,
  rotationOf,
  type Renderable,
} from '../browser/referenceAlignment';
import {
  greyCanvasOf,
  loadGreyImage,
  recordingTimeOf,
  STUDIO_CLIPS,
  type GreyImage,
  type ReferenceClip,
  type ReferenceFrame,
} from '../browser/referenceFrames';
import { equirectangularRendering, motionOf } from '../browser/rendering';
import { timeRenders } from '../browser/samplingChecks';
import {
  binDifferences,
  matchedGains,
  measuredDisparity,
  seamBandOf,
  type MeasuredDisparity,
  type SeamBand,
} from '../browser/seamJoins';
import { isServed } from '../browser/sampleUrls';
import { closeMoment, decodeMoment } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const FRAME_TIMEOUT_MS = 300_000;
const JOINS: readonly SeamJoin[] = ['fixed', 'bent', 'cut'];
const SILENT: Vector3 = [0, 0, 0];
const AT_REST: PoseDelta = { yaw: degrees(0), pitch: degrees(0), roll: degrees(0) };
/**
 * The bins by how far the field bends them, in degrees: near objects (a degree is an object
 * about two metres away) up to the most a bend takes and beyond it, the lens models' own error
 * at the seam (which parallax never makes negative), small bends, and none.
 */
const BEND_CLASSES: readonly { readonly name: string; readonly isIn: (bend: number) => boolean }[] =
  [
    { name: 'near', isIn: (bend) => bend >= 1 && bend < SEAM_MAX_BEND },
    { name: 'nearest', isIn: (bend) => bend >= SEAM_MAX_BEND },
    { name: 'model error', isIn: (bend) => bend <= -1 },
    { name: 'small', isIn: (bend) => Math.abs(bend) >= 0.25 && Math.abs(bend) < 1 },
    { name: 'unbent', isIn: (bend) => Math.abs(bend) < 0.25 },
  ];
/**
 * The frames whose three joins are saved beside Studio's, for the eye.
 */
const SAVED_FRAMES = new Set([55, 100, 145]);
/**
 * The moment whose consecutive frames show how steady each join is, and how many of them.
 */
const STEADINESS_TIME = 100;
const STEADINESS_PAIRS = 16;

type PerBin = readonly number[];

interface FrameResult {
  readonly time: number;
  readonly disparity: MeasuredDisparity;
  /**
   * Per join, each bin's mean level difference to Studio's stitch.
   */
  readonly toStudio: Readonly<Record<SeamJoin, PerBin>>;
  /**
   * Per join that moves the lenses' images, each bin's mean level difference between the two
   * lenses drawn alone: the double image a blend makes of them.
   */
  readonly lensDisagreement: Readonly<Record<'fixed' | 'bent', PerBin>>;
  /**
   * Each bin's change in the fixed join's difference to Studio from the frame to the next:
   * how much of a difference is the measurement's own noise.
   */
  readonly noise: PerBin;
}

interface Drawn {
  readonly renderable: Renderable;
  readonly view: PoseDelta;
  readonly gains: readonly Vector3[];
}

function withJoin(drawn: Drawn, join: SeamJoin, field: readonly Degrees[]): GreyImage {
  drawn.renderable.renderer.setSeamAlignment({ join, disparities: field });
  return renderUnder(drawn.renderable, drawn.view);
}

/**
 * One lens drawn alone at its matched gain, the other silenced.
 */
function drawnAlone(drawn: Drawn, lensIndex: number): GreyImage {
  const gains = drawn.gains.map((gain, index) => (index === lensIndex ? gain : SILENT));
  drawn.renderable.renderer.setLensGains(gains);
  const image = renderUnder(drawn.renderable, drawn.view);
  drawn.renderable.renderer.setLensGains(drawn.gains);
  return image;
}

function lensDisagreementUnder(
  drawn: Drawn,
  join: SeamJoin,
  at: { readonly field: readonly Degrees[]; readonly band: SeamBand },
): PerBin {
  drawn.renderable.renderer.setSeamAlignment({ join, disparities: at.field });
  return binDifferences(drawnAlone(drawn, 0), drawnAlone(drawn, 1), at.band);
}

function lockOf(pair: FramePair<VideoFrame>, opened: OpenedRecording): Matrix3 {
  return stabilizerFor('lock').nextRotation(
    motionOf(opened).orientations.orientationAt(pair.timestamp),
    pair.timestamp,
  );
}

/**
 * The three joins stacked under Studio's stitch, for the eye.
 */
function sheetOf(images: readonly GreyImage[]): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = PANORAMA_SIZE.width;
  sheet.height = PANORAMA_SIZE.height * images.length;
  const context = sheet.getContext('2d');
  for (const [index, image] of images.entries()) {
    context?.drawImage(greyCanvasOf(image), 0, index * PANORAMA_SIZE.height);
  }
  return sheet;
}

async function measureFrame(
  context: TestContext,
  at: {
    readonly clip: ReferenceClip;
    readonly frame: ReferenceFrame;
    readonly cleanups: (() => void)[];
  },
): Promise<FrameResult> {
  const { clip, frame, cleanups } = at;
  const reference = await loadGreyImage(frame.url);
  const opened = await openSample(context, clip.sample);
  cleanups.push(() => {
    opened.dispose();
  });
  const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
  cleanups.push(dispose);
  const moment = await decodeMoment(opened, recordingTimeOf(clip, frame));
  cleanups.push(() => {
    closeMoment(moment);
  });
  const renderable: Renderable = {
    renderer,
    canvas,
    pair: moment.first,
    lock: lockOf(moment.first, opened),
  };
  renderUnder(renderable, AT_REST);
  const gains = await matchedGains(renderer);
  renderer.setLensGains(gains);
  const view = alignToReference(reference, renderable).rotation;
  const drawn: Drawn = { renderable, view, gains };
  const disparity = await measuredDisparity(renderer, gains);
  const band = seamBandOf(PANORAMA_SIZE, multiplyMatrices(renderable.lock, rotationOf(view)));
  const images = JOINS.map((join) => withJoin(drawn, join, disparity.field));
  const [fixed, bent, cut] = images.map((image) => binDifferences(image, reference, band));
  if (!fixed || !bent || !cut) throw new Error('three joins expected');
  const following: Drawn = {
    ...drawn,
    renderable: { ...renderable, pair: moment.second, lock: lockOf(moment.second, opened) },
  };
  const next = binDifferences(withJoin(following, 'fixed', disparity.field), reference, band);
  const prefix = `${clip.slug}-${frame.time}s`;
  if (SAVED_FRAMES.has(frame.time)) {
    await saveRender(`${prefix}-seam-joins`, sheetOf([reference, ...images]));
  }
  return {
    time: frame.time,
    disparity,
    toStudio: { fixed, bent, cut },
    lensDisagreement: {
      fixed: lensDisagreementUnder(drawn, 'fixed', { field: disparity.field, band }),
      bent: lensDisagreementUnder(drawn, 'bent', { field: disparity.field, band }),
    },
    noise: fixed.map((difference, bin) => Math.abs(difference - (next[bin] ?? NaN))),
  };
}

function countedValues(
  result: FrameResult,
  values: PerBin,
  isCounted: (result: FrameResult, bin: number) => boolean,
): number[] {
  return values.filter((value, bin) => isCounted(result, bin) && Number.isFinite(value));
}

/**
 * The mean of the values of the bins `isCounted` picks, over every frame.
 */
function meanOver(
  results: readonly FrameResult[],
  valuesOf: (result: FrameResult) => PerBin,
  isCounted: (result: FrameResult, bin: number) => boolean,
): { mean: number; bins: number } {
  const counted = results.flatMap((result) => countedValues(result, valuesOf(result), isCounted));
  return { mean: meanOf(counted), bins: counted.length };
}

function meanOf(values: readonly number[]): number {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : NaN;
}

function summaryOf(results: readonly FrameResult[]): object {
  const over = (valuesOf: (result: FrameResult) => PerBin): object =>
    Object.fromEntries(
      BEND_CLASSES.map(({ name, isIn }) => [
        name,
        meanOver(results, valuesOf, (result, bin) => isIn(result.disparity.field[bin] ?? 0)),
      ]),
    );
  return {
    frames: results.length,
    toStudio: Object.fromEntries(
      JOINS.map((join) => [join, over((result) => result.toStudio[join])]),
    ),
    lensDisagreement: {
      fixed: over((result) => result.lensDisagreement.fixed),
      bent: over((result) => result.lensDisagreement.bent),
    },
    noise: over((result) => result.noise),
    bins: Object.fromEntries(
      BEND_CLASSES.map(({ name, isIn }) => [
        name,
        results.flatMap((result) => result.disparity.field.filter((bend) => isIn(bend))).length,
      ]),
    ),
    trustedBins: results.map(
      (result) => result.disparity.bins.filter((bin) => bin.isTrusted).length,
    ),
    largestDisparity: results.map((result) => Math.max(...result.disparity.field)),
    estimateMilliseconds: results.map((result) => result.disparity.milliseconds),
  };
}

/**
 * What the steadiness run carries from one frame to the next.
 */
interface Steadiness {
  field: Degrees[] | undefined;
  time: number;
  images: Partial<Record<SeamJoin, GreyImage>>;
  readonly change: Record<SeamJoin, number>;
}

interface SteadyDrawing {
  readonly renderer: Renderable['renderer'];
  readonly canvas: HTMLCanvasElement;
  readonly band: SeamBand;
}

/**
 * Measures the pair's disparity, eases the field toward it, draws each join and adds its
 * change from the frame before.
 */
async function stepSteadiness(
  steadiness: Steadiness,
  drawing: SteadyDrawing,
  pair: FramePair<VideoFrame>,
): Promise<void> {
  const { renderer, canvas, band } = drawing;
  const renderable: Renderable = { renderer, canvas, pair, lock: IDENTITY_MATRIX3 };
  renderUnder(renderable, AT_REST);
  const gains = await matchedGains(renderer);
  renderer.setLensGains(gains);
  const measured = await measuredDisparity(renderer, gains);
  const field = easedDisparities(
    steadiness.field,
    measured.field,
    seconds(pair.timestamp - steadiness.time),
  );
  const images: Partial<Record<SeamJoin, GreyImage>> = {};
  for (const join of JOINS) {
    const image = withJoin({ renderable, view: AT_REST, gains }, join, field);
    const before = steadiness.images[join];
    if (before) steadiness.change[join] += bandMean(binDifferences(image, before, band));
    images[join] = image;
  }
  Object.assign(steadiness, { field, time: pair.timestamp, images });
}

/**
 * The mean level change in the band from each frame to the next, per join, on consecutive
 * frames drawn in the body frame, so that the seam stays put on the panorama and only the
 * camera's own turning moves the picture, alike for every join. Each frame's field is eased
 * from the one before, as a player would show it. And how long each join takes to draw.
 */
async function steadinessOf(
  opened: OpenedRecording,
  pairs: readonly FramePair<VideoFrame>[],
): Promise<object> {
  const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
  try {
    const drawing = { renderer, canvas, band: seamBandOf(PANORAMA_SIZE, IDENTITY_MATRIX3) };
    const steadiness: Steadiness = {
      field: undefined,
      time: 0,
      images: {},
      change: { fixed: 0, bent: 0, cut: 0 },
    };
    for (const pair of pairs) await stepSteadiness(steadiness, drawing, pair);
    const [first, second] = pairs;
    if (!first || !second) throw new Error('two pairs expected');
    const locked = [
      { pair: first, lock: IDENTITY_MATRIX3 },
      { pair: second, lock: IDENTITY_MATRIX3 },
    ] as const;
    const disparities = steadiness.field ?? FIXED_SEAM.disparities;
    const millisecondsPerRender = Object.fromEntries(
      JOINS.map((join) => {
        renderer.setSeamAlignment({ join, disparities });
        return [join, timeRenders(renderer, canvas, locked)];
      }),
    );
    const steps = pairs.length - 1;
    return {
      changePerFrame: Object.fromEntries(
        JOINS.map((join) => [join, steadiness.change[join] / steps]),
      ),
      millisecondsPerRender,
    };
  } finally {
    dispose();
  }
}

function bandMean(perBin: PerBin): number {
  return meanOf(perBin.filter((value) => Number.isFinite(value)));
}

/**
 * The fixed seam, the seam bent by the disparity measured across it, and the seam cut where
 * the disparity is large, each against Insta360 Studio's stitch, on frames spread over the
 * clip; and how steady and how costly each is on consecutive frames.
 */
for (const clip of STUDIO_CLIPS) {
  describe(`the seam joins against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];
    const results: FrameResult[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    for (const frame of clip.frames) {
      it(
        `joins the seam three ways on the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const result = await measureFrame(context, { clip, frame, cleanups });
          results.push(result);
          await saveMeasurement(`${clip.slug}-${frame.time}s-seam-joins`, result);
          expect(result.disparity.field).toHaveLength(result.toStudio.fixed.length);
        },
        FRAME_TIMEOUT_MS,
      );
    }

    it('summarises the joins over the frames, near bins and far ones apart', async (context) => {
      if (results.length === 0) context.skip('no frame was measured');
      await saveMeasurement(`${clip.slug}-seam-joins`, summaryOf(results));
      expect(results.length).toBeGreaterThan(0);
    });

    it(
      'measures how steady and how costly each join is on consecutive frames',
      async (context) => {
        const opened = await openSample(context, clip.sample);
        cleanups.push(() => {
          opened.dispose();
        });
        const pipeline = new DecodePipeline<VideoFrame>(
          opened.frameSources,
          port,
          DECODE_PIPELINE_OPTIONS,
        );
        const pairs = await takePairs(pipeline, clip.start + STEADINESS_TIME, STEADINESS_PAIRS);
        cleanups.push(() => {
          closeAll(pairs);
        });
        const steadiness = await steadinessOf(opened, pairs);
        await saveMeasurement(`${clip.slug}-seam-join-steadiness`, steadiness);
        expect(steadiness).toBeDefined();
      },
      FRAME_TIMEOUT_MS,
    );
  });
}
