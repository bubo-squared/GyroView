import {
  DecodePipeline,
  easedDisparities,
  FIXED_SEAM_ALIGNMENT,
  IDENTITY_MATRIX3,
  multiplyMatrices,
  SEAM_MAX_BEND,
  seconds,
  type Degrees,
  type FramePair,
  type SeamAlignment,
  type SeamJoin,
  type Seconds,
  type Vector3,
} from '@gyroview/core';
import { DECODE_PIPELINE_OPTIONS, type OpenedRecording } from '@gyroview/player/composition';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { closeAll, openSample, port, takePairs } from '../browser/realRecordingSupport';
import {
  alignToReference,
  NO_TURN,
  renderUnder,
  rotationOf,
  type LockedRendering,
  type ViewTurn,
} from './support/referenceAlignment';
import {
  greyCanvasOf,
  REFERENCE_PANORAMA_SIZE,
  STUDIO_CLIPS,
  type GreyImage,
} from './support/referenceFrames';
import { gainsShowingOnly, lockOf } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import { labRendering } from './support/labRendering';
import {
  bandShownBy,
  binDifferences,
  matchedGains,
  measuredDisparity,
  millisecondsPerDraw,
  seamBandOf,
  type MeasuredDisparity,
  type SeamBand,
} from './support/seamJoins';
import { meanOf } from './support/statistics';
import { openStudioFrame, type StudioFrameRequest } from './support/studioFrame';

const FRAME_TIMEOUT_MS = 300_000;
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
 * The frames whose joins are saved beside Studio's, for the eye.
 */
const SAVED_FRAMES = new Set([55, 100, 145]);
/**
 * The moment whose consecutive frames show how steady each join is, and how many of them.
 */
const STEADINESS_START_SECONDS = 100;
const STEADINESS_PAIRS = 16;

type PerBin = readonly number[];
type PerJoin<Value> = Readonly<Record<SeamJoin, Value>>;

interface FrameResult {
  readonly time: Seconds;
  readonly disparity: MeasuredDisparity;
  /**
   * Per join, each bin's mean level difference to Studio's stitch.
   */
  readonly toStudio: PerJoin<PerBin>;
  /**
   * Per join, each bin's mean level difference between the two lenses drawn alone, the double
   * image a blend makes of them, over the pixels both lenses show under every join.
   */
  readonly lensDisagreement: PerJoin<PerBin>;
  /**
   * Each bin's change in the fixed join's difference to Studio from the frame to the next:
   * how much of a difference is the measurement's own noise.
   */
  readonly noise: PerBin;
}

interface Drawn {
  readonly rendering: LockedRendering;
  readonly view: ViewTurn;
  readonly gains: readonly Vector3[];
}

function perJoin<Value>(valueOf: (join: SeamJoin) => Value): PerJoin<Value> {
  return { fixed: valueOf('fixed'), bent: valueOf('bent') };
}

function alignmentOf(join: SeamJoin, field: readonly Degrees[]): SeamAlignment {
  return { join, disparities: field };
}

function withJoin(drawn: Drawn, alignment: SeamAlignment): GreyImage {
  drawn.rendering.renderer.setSeamAlignment(alignment);
  return renderUnder(drawn.rendering, drawn.view);
}

/**
 * Each lens drawn alone at its matched gain under the alignment, the other silenced.
 */
function lensesAloneUnder(drawn: Drawn, alignment: SeamAlignment): readonly [GreyImage, GreyImage] {
  const { renderer } = drawn.rendering;
  renderer.setSeamAlignment(alignment);
  const [front, back] = [0, 1].map((lensIndex) => {
    renderer.setLensGains(gainsShowingOnly(drawn.gains, lensIndex));
    return renderUnder(drawn.rendering, drawn.view);
  });
  renderer.setLensGains(drawn.gains);
  if (!front || !back) throw new Error('two lenses expected');
  return [front, back];
}

function lensDisagreements(
  drawn: Drawn,
  field: readonly Degrees[],
  band: SeamBand,
): PerJoin<PerBin> {
  const alone = perJoin((join) => lensesAloneUnder(drawn, alignmentOf(join, field)));
  const shown = bandShownBy(band, [...alone.fixed, ...alone.bent]);
  return perJoin((join) => binDifferences(alone[join][0], alone[join][1], shown));
}

/**
 * The joins stacked under Studio's stitch, for the eye.
 */
function sheetOf(images: readonly GreyImage[]): HTMLCanvasElement {
  const { width, height } = REFERENCE_PANORAMA_SIZE;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height * images.length;
  const context = sheet.getContext('2d');
  for (const [index, image] of images.entries()) {
    context?.drawImage(greyCanvasOf(image), 0, index * height);
  }
  return sheet;
}

async function measureFrame(
  context: TestContext,
  request: StudioFrameRequest,
): Promise<FrameResult> {
  const { reference, opened, moment, rendering } = await openStudioFrame(context, request);
  renderUnder(rendering, NO_TURN);
  const gains = await matchedGains(rendering.renderer);
  rendering.renderer.setLensGains(gains);
  const drawn: Drawn = { rendering, view: alignToReference(reference, rendering).turn, gains };
  const disparity = await measuredDisparity(rendering.renderer, gains);
  const viewToBody = multiplyMatrices(rendering.lock, rotationOf(drawn.view));
  const band = seamBandOf(REFERENCE_PANORAMA_SIZE, viewToBody);
  const images = perJoin((join) => withJoin(drawn, alignmentOf(join, disparity.field)));
  const following: Drawn = {
    ...drawn,
    rendering: { ...rendering, pair: moment.second, lock: lockOf(opened, moment.second) },
  };
  const toStudio = perJoin((join) => binDifferences(images[join], reference, band));
  await saveSheetIfChosen(request, [reference, images.fixed, images.bent]);
  return {
    time: request.frame.time,
    disparity,
    toStudio,
    lensDisagreement: lensDisagreements(drawn, disparity.field, band),
    noise: noiseOf(
      toStudio.fixed,
      binDifferences(withJoin(following, FIXED_SEAM_ALIGNMENT), reference, band),
    ),
  };
}

/**
 * How much each bin's difference to Studio changes from the frame to the next.
 */
function noiseOf(atFrame: PerBin, atNext: PerBin): PerBin {
  return atFrame.map((difference, bin) => Math.abs(difference - (atNext[bin] ?? NaN)));
}

async function saveSheetIfChosen(
  request: StudioFrameRequest,
  images: readonly GreyImage[],
): Promise<void> {
  const { time } = request.frame;
  if (!SAVED_FRAMES.has(time)) return;
  await saveRender(`${request.clip.slug}-${time}s-seam-joins`, sheetOf(images));
}

function finite(values: PerBin): number[] {
  return values.filter((value) => Number.isFinite(value));
}

/**
 * The mean, over every frame, of the finite values of the bins the field bends as `isIn` says.
 */
function meanOver(
  results: readonly FrameResult[],
  valuesOf: (result: FrameResult) => PerBin,
  isIn: (bend: number) => boolean,
): { mean: number; bins: number } {
  const counted = results.flatMap((result) =>
    finite(valuesOf(result).filter((_value, bin) => isIn(result.disparity.field[bin] ?? 0))),
  );
  return { mean: meanOf(counted), bins: counted.length };
}

function summaryOf(results: readonly FrameResult[]): object {
  const byBend = (valuesOf: (result: FrameResult) => PerBin): object =>
    Object.fromEntries(
      BEND_CLASSES.map(({ name, isIn }) => [name, meanOver(results, valuesOf, isIn)]),
    );
  return {
    frames: results.length,
    toStudio: perJoin((join) => byBend((result) => result.toStudio[join])),
    lensDisagreement: perJoin((join) => byBend((result) => result.lensDisagreement[join])),
    noise: byBend((result) => result.noise),
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
  readonly field: readonly Degrees[] | undefined;
  readonly time: Seconds;
  readonly images: Partial<PerJoin<GreyImage>>;
  readonly change: PerJoin<number>;
}

const STEADY_START: Steadiness = {
  field: undefined,
  time: seconds(0),
  images: {},
  change: { fixed: 0, bent: 0 },
};

interface SteadyDrawing {
  readonly rendering: LockedRendering;
  readonly band: SeamBand;
}

/**
 * The steadiness after one more pair: its disparity measured, the field eased toward it, each
 * join drawn and its change from the frame before added.
 */
async function nextSteadiness(
  before: Steadiness,
  drawing: SteadyDrawing,
  pair: FramePair<VideoFrame>,
): Promise<Steadiness> {
  const rendering = { ...drawing.rendering, pair };
  renderUnder(rendering, NO_TURN);
  const gains = await matchedGains(rendering.renderer);
  rendering.renderer.setLensGains(gains);
  const measured = await measuredDisparity(rendering.renderer, gains);
  const elapsed = seconds(pair.timestamp - before.time);
  const field = easedDisparities(before.field, measured.field, elapsed);
  const images = perJoin((join) =>
    withJoin({ rendering, view: NO_TURN, gains }, alignmentOf(join, field)),
  );
  const change = perJoin((join) => {
    const previous = before.images[join];
    if (!previous) return before.change[join];
    const step = meanOf(finite(binDifferences(images[join], previous, drawing.band)));
    return before.change[join] + step;
  });
  return { field, time: pair.timestamp, images, change };
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
  const { canvas, renderer, dispose } = labRendering(opened, REFERENCE_PANORAMA_SIZE);
  try {
    const [first, second] = pairs;
    if (!first || !second) throw new Error('two pairs expected');
    const rendering: LockedRendering = { renderer, canvas, pair: first, lock: IDENTITY_MATRIX3 };
    const drawing = { rendering, band: seamBandOf(REFERENCE_PANORAMA_SIZE, IDENTITY_MATRIX3) };
    let steadiness = STEADY_START;
    for (const pair of pairs) steadiness = await nextSteadiness(steadiness, drawing, pair);
    const disparities = steadiness.field ?? FIXED_SEAM_ALIGNMENT.disparities;
    const drawTimes = perJoin((join) => {
      renderer.setSeamAlignment(alignmentOf(join, disparities));
      return millisecondsPerDraw([rendering, { ...rendering, pair: second }]);
    });
    const steps = pairs.length - 1;
    return {
      changePerFrame: perJoin((join) => steadiness.change[join] / steps),
      millisecondsPerDraw: drawTimes,
    };
  } finally {
    dispose();
  }
}

/**
 * The fixed seam and the seam bent by the disparity measured across it, each against Insta360
 * Studio's stitch, on frames spread over the clip; and how steady and how costly each is on
 * consecutive frames (ADR 0026).
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
        `joins the seam fixed and bent on the Studio frame at ${frame.time} s`,
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

    it('summarises the joins over the frames, by how far the field bends each bin', async (context) => {
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
        const pairs = await takePairs(
          pipeline,
          clip.start + STEADINESS_START_SECONDS,
          STEADINESS_PAIRS,
        );
        cleanups.push(() => {
          closeAll(pairs);
        });
        const steadiness = await steadinessOf(opened, pairs);
        await saveMeasurement(`${clip.slug}-seam-join-steadiness`, steadiness);
        expect(steadiness).toHaveProperty('changePerFrame');
      },
      FRAME_TIMEOUT_MS,
    );
  });
}
