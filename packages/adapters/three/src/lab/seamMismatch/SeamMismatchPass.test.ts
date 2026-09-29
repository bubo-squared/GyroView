import {
  buildStitchingSetup,
  degrees,
  seconds,
  type DecodedFrame,
  type Degrees,
  type SeamBinCosts,
  type SeamMismatchMeter,
  type Vector3,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_SLIDES } from './SeamMismatchPass';
import { nearScenePair, type NearScene } from '../test/nearScene';
import { MULTI_TRACK, syntheticCalibration } from '../../test/syntheticStitching';
import { LabRenderer } from '../LabRenderer';

const CANVAS = { width: 64, height: 32 };
const UNIT_GAIN: Vector3 = [1, 1, 1];
const DOUBLED_GAIN: Vector3 = [2, 2, 2];
const UNIT_GAINS: readonly Vector3[] = [UNIT_GAIN, UNIT_GAIN];
/**
 * Two 8-bit frames of one smooth scene, read through bilinear taps, differ by a level or so.
 */
const AGREEMENT = 0.01;
/**
 * A lens half as bright as the other, compared at unit gain, disagrees by about a quarter of
 * the range, the cap.
 */
const CLEAR_DISAGREEMENT = 0.1;
const PAINTED_DISPARITY = 1.5;
/**
 * A slide a degree and a half off costs several times what the painted one does.
 */
const CLEAR_RATIO = 5;

function slidesAt(...values: readonly number[]): Degrees[] {
  return values.map((value) => degrees(value));
}

/**
 * The mean mismatch over the bins of one slide's costs.
 */
function meanOf(bins: SeamBinCosts | undefined): number {
  if (!bins) throw new Error('the strip was not measured');
  return bins.reduce((total, bin) => total + bin.mismatch, 0) / bins.length;
}

describe('SeamMismatchPass', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: LabRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  /**
   * Both lenses recording the ring scene as `painting` says, on screen with a meter over them.
   */
  function meterOver(painting: Pick<NearScene, 'disparity' | 'backBrightness'>): SeamMismatchMeter {
    const calibration = syntheticCalibration();
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS.width;
    canvas.height = CANVAS.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const renderer = LabRenderer.create(canvas, setup);
    renderers.push(renderer);
    const pair = nearScenePair({ calibration, setup, ...painting });
    frames.push(...pair);
    renderer.present({ pair: { timestamp: seconds(0), frames: pair }, mediaTime: seconds(0) });
    return renderer.createSeamMismatchMeter();
  }

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('finds no disagreement unslid over a far scene, on a strip both lenses image whole', async () => {
    const meter = meterOver({ disparity: () => degrees(0) });
    const [bins = []] = (await meter.measure({ slides: slidesAt(0), gains: UNIT_GAINS })) ?? [];
    for (const bin of bins) expect(bin.validity).toBe(1);
    expect(meanOf(bins)).toBeLessThan(AGREEMENT);
  });

  it('measures the slides in their order, one row each', async () => {
    const meter = meterOver({ disparity: () => degrees(PAINTED_DISPARITY) });
    const measured = await meter.measure({ slides: slidesAt(3, 0, 1.5), gains: UNIT_GAINS });
    const [farther, unslid, painted] = (measured ?? []).map((bins) => meanOf(bins));
    expect(painted).toBeLessThan(AGREEMENT);
    expect(farther).toBeGreaterThan(CLEAR_RATIO * (painted ?? NaN));
    expect(unslid).toBeGreaterThan(CLEAR_RATIO * (painted ?? NaN));
  });

  it('applies the gains before comparing, so a darker back lens agrees at its gain', async () => {
    const meter = meterOver({ disparity: () => degrees(0), backBrightness: 0.5 });
    const [unmatched] = (await meter.measure({ slides: slidesAt(0), gains: UNIT_GAINS })) ?? [];
    const matched = await meter.measure({
      slides: slidesAt(0),
      gains: [UNIT_GAIN, DOUBLED_GAIN],
    });
    expect(meanOf(unmatched)).toBeGreaterThan(CLEAR_DISAGREEMENT);
    expect(meanOf(matched?.[0])).toBeLessThan(AGREEMENT);
  });

  it('refuses an empty list of slides, more slides than one measurement takes, and gains for another number of lenses', async () => {
    const meter = meterOver({ disparity: () => degrees(0) });
    const tooMany = slidesAt(...Array.from({ length: MAX_SLIDES + 1 }, () => 0));
    const requests = [
      { slides: [], gains: UNIT_GAINS },
      { slides: tooMany, gains: UNIT_GAINS },
      { slides: slidesAt(0), gains: [UNIT_GAIN, UNIT_GAIN, UNIT_GAIN] },
    ];
    for (const request of requests) {
      await expect(meter.measure(request)).rejects.toThrow(
        expect.objectContaining({ code: 'invariant-violation' }),
      );
    }
  });

  it('keeps two measurements begun together apart: each reads back its own slides', async () => {
    const meter = meterOver({ disparity: () => degrees(PAINTED_DISPARITY) });
    const [atPainted, atZero] = await Promise.all([
      meter.measure({ slides: slidesAt(PAINTED_DISPARITY), gains: UNIT_GAINS }),
      meter.measure({ slides: slidesAt(0, 0), gains: UNIT_GAINS }),
    ]);
    expect(atPainted).toHaveLength(1);
    expect(atZero).toHaveLength(2);
    expect(meanOf(atPainted?.[0])).toBeLessThan(AGREEMENT);
    expect(meanOf(atZero?.[1])).toBeGreaterThan(CLEAR_RATIO * meanOf(atPainted?.[0]));
  });

  it('measures nothing once disposed', async () => {
    const meter = meterOver({ disparity: () => degrees(0) });
    meter.dispose();
    await expect(meter.measure({ slides: slidesAt(0), gains: UNIT_GAINS })).resolves.toBe(
      undefined,
    );
  });
});
