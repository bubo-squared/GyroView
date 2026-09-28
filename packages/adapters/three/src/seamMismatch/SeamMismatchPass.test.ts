import {
  buildStitchingSetup,
  clamp,
  degrees,
  degreesToRadians,
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutZ,
  seamCostOf,
  seconds,
  transformVector,
  transposeMatrix,
  type CalibrationSet,
  type DecodedFrame,
  type LensCalibration,
  type Matrix3,
  type SeamBinCosts,
  type SeamCandidates,
  type SeamMismatchMeter,
  type Vector3,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_CANDIDATES_PER_BATCH } from './SeamMismatchPass';
import { paintedFrame } from '../test/syntheticFrames';
import { MULTI_TRACK, syntheticCalibration } from '../test/syntheticStitching';
import { ThreeFrameRenderer } from '../ThreeFrameRenderer';

const FRAME_SIZE = 256;
const CANVAS = { width: 64, height: 32 };
const UNIT_GAIN: Vector3 = [1, 1, 1];
const DOUBLED_GAIN: Vector3 = [2, 2, 2];
const UNIT_GAINS: readonly Vector3[] = [UNIT_GAIN, UNIT_GAIN];
/**
 * The turn painted into the back lens beyond its calibration, and the sweep that must find it.
 */
const PAINTED_TURN_DEGREES = 0.7;
const SWEEP_EXTENT_DEGREES = 1.5;
const SWEEP_STEP_DEGREES = 0.1;
/**
 * Two 8-bit frames of one smooth scene, read through bilinear taps, differ by a level or so.
 */
const AGREEMENT = 0.01;
/**
 * A lens half as bright as the other, compared at unit gain, disagrees by about a quarter of
 * the range, the cap.
 */
const CLEAR_DISAGREEMENT = 0.1;
const CLEAR_RATIO = 3;
const HAIR = 1e-9;

/**
 * The scene both lenses record: a luma that varies 24 times around the ring and tilts across
 * it, so any turn of a lens about any axis shows along the strip.
 */
const RING_CYCLES = 24;
const RING_AMPLITUDE = 0.2;
const TILT_PER_UNIT_Z = 1.9;

function sceneLuma(direction: Vector3): number {
  const [x, y, z] = direction;
  return clamp(
    0.5 + RING_AMPLITUDE * Math.sin(RING_CYCLES * Math.atan2(y, x)) + TILT_PER_UNIT_Z * z,
    0,
    1,
  );
}

interface Recording {
  readonly lens: LensCalibration;
  readonly calibration: CalibrationSet;
  readonly bodyToLens: Matrix3;
  readonly brightness?: number;
}

/**
 * What an ideal equidistant lens with the given body-to-lens rotation records of the scene:
 * each frame pixel is mapped back through the lens to its body direction.
 */
function recordedFrame({
  lens,
  calibration,
  bodyToLens,
  brightness = 1,
}: Recording): DecodedFrame<VideoFrame> {
  const lensToBody = transposeMatrix(bodyToLens);
  const side = calibration.canvas.height;
  const squareX = Math.floor(lens.model.principalPoint.x / side) * side;
  const { principalPoint, halfFieldOfView } = lens.model;
  const rim = lens.model.project([Math.sin(halfFieldOfView), 0, Math.cos(halfFieldOfView)]);
  if (!rim) throw new Error('the lens images its own rim');
  const edgeRadius = rim.x - principalPoint.x;
  return paintedFrame(FRAME_SIZE, (column, row) => {
    const dx = squareX + ((column + 0.5) / FRAME_SIZE) * side - principalPoint.x;
    const dy = ((row + 0.5) / FRAME_SIZE) * side - principalPoint.y;
    const radius = Math.hypot(dx, dy);
    const theta = (radius / edgeRadius) * halfFieldOfView;
    if (theta > halfFieldOfView) return 0;
    const lateral = radius > 0 ? [dx / radius, dy / radius] : [0, 0];
    const inLens: Vector3 = [
      Math.sin(theta) * (lateral[0] ?? 0),
      Math.sin(theta) * (lateral[1] ?? 0),
      Math.cos(theta),
    ];
    return brightness * sceneLuma(transformVector(lensToBody, inLens));
  });
}

interface Scene {
  readonly meter: SeamMismatchMeter;
  /**
   * The back lens's calibrated body-to-lens rotation.
   */
  readonly backPose: Matrix3;
}

/**
 * How the back lens is painted beyond its calibration.
 */
interface BackLens {
  readonly turn?: Matrix3;
  readonly brightness?: number;
}

function rotationsOf(rotations: readonly Matrix3[]): SeamCandidates {
  return { kind: 'rotations', rotations };
}

function turnOf(deltaDegrees: number): Matrix3 {
  return rotationAboutZ(degreesToRadians(degrees(deltaDegrees)));
}

function sweepDeltas(): number[] {
  const count = Math.round((2 * SWEEP_EXTENT_DEGREES) / SWEEP_STEP_DEGREES) + 1;
  return Array.from(
    { length: count },
    (_unused, index) => -SWEEP_EXTENT_DEGREES + index * SWEEP_STEP_DEGREES,
  );
}

function costOf(bins: SeamBinCosts | undefined): number {
  const cost = bins ? seamCostOf(bins) : undefined;
  if (cost === undefined) throw new Error('the strip was not measured');
  return cost;
}

describe('SeamMismatchPass', () => {
  const canvases: HTMLCanvasElement[] = [];
  const renderers: ThreeFrameRenderer[] = [];
  const frames: DecodedFrame<VideoFrame>[] = [];

  /**
   * Both lenses recording the scene, the back one painted beyond its calibration as `back`
   * says, on screen with a meter over them.
   */
  function openScene(back: BackLens = {}): Scene {
    const calibration = syntheticCalibration();
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    const [front, rear] = calibration.lenses;
    const [frontStitch, rearStitch] = setup.lenses;
    if (!front || !rear || !frontStitch || !rearStitch) throw new Error('two lenses expected');
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS.width;
    canvas.height = CANVAS.height;
    document.body.append(canvas);
    canvases.push(canvas);
    const renderer = ThreeFrameRenderer.create(canvas, setup);
    renderers.push(renderer);
    const { turn = IDENTITY_MATRIX3, ...painting } = back;
    const pair = [
      recordedFrame({ lens: front, calibration, bodyToLens: frontStitch.rotation }),
      recordedFrame({
        lens: rear,
        calibration,
        bodyToLens: multiplyMatrices(rearStitch.rotation, turn),
        ...painting,
      }),
    ];
    frames.push(...pair);
    renderer.present({ pair: { timestamp: seconds(0), frames: pair }, mediaTime: seconds(0) });
    return { meter: renderer.createSeamMismatchMeter(), backPose: rearStitch.rotation };
  }

  afterEach(() => {
    for (const renderer of renderers.splice(0)) renderer.dispose();
    for (const frame of frames.splice(0)) frame.close();
    for (const canvas of canvases.splice(0)) canvas.remove();
  });

  it('finds no disagreement at the poses the lenses recorded with, over a strip both image whole', async () => {
    const { meter, backPose } = openScene();
    const measured = await meter.measure({
      lensIndex: 1,
      candidates: rotationsOf([backPose]),
      gains: UNIT_GAINS,
    });
    const [bins] = measured ?? [];
    if (!bins) throw new Error('the strip was not measured');
    for (const bin of bins) expect(bin.validity).toBe(1);
    expect(costOf(bins)).toBeLessThan(AGREEMENT);
  });

  it('finds the turn the back lens recorded with among the candidates, to a tenth of a degree', async () => {
    const { meter, backPose } = openScene({ turn: turnOf(PAINTED_TURN_DEGREES) });
    const deltas = sweepDeltas();
    const candidates = deltas.map((delta) => multiplyMatrices(backPose, turnOf(delta)));
    const measured = await meter.measure({
      lensIndex: 1,
      candidates: rotationsOf(candidates),
      gains: UNIT_GAINS,
    });
    const costs = (measured ?? []).map((bins) => costOf(bins));
    const best = costs.indexOf(Math.min(...costs));
    const found = deltas[best] ?? NaN;
    expect(Math.abs(found - PAINTED_TURN_DEGREES)).toBeLessThanOrEqual(SWEEP_STEP_DEGREES + HAIR);
    const atCalibration = costs[deltas.indexOf(0)] ?? NaN;
    expect(atCalibration).toBeGreaterThan(CLEAR_RATIO * (costs[best] ?? NaN));
  });

  it('applies the gains before comparing, so a darker back lens agrees at its gain', async () => {
    const { meter, backPose } = openScene({ brightness: 0.5 });
    const request = { lensIndex: 1, candidates: rotationsOf([backPose]) };
    const matched = await meter.measure({ ...request, gains: [UNIT_GAIN, DOUBLED_GAIN] });
    const unmatched = await meter.measure({ ...request, gains: UNIT_GAINS });
    expect(costOf(matched?.[0])).toBeLessThan(AGREEMENT);
    expect(costOf(unmatched?.[0])).toBeGreaterThan(CLEAR_DISAGREEMENT);
  });

  it('slides the back lens’s sampling along the ring: a lens turned by a roll aligns at that slide in every bin', async () => {
    const { meter } = openScene({ turn: turnOf(PAINTED_TURN_DEGREES) });
    const shifts = sweepDeltas().map((along) => ({ along: degrees(along), across: degrees(0) }));
    const measured = await meter.measure({
      lensIndex: 1,
      candidates: { kind: 'shifts', shifts },
      gains: UNIT_GAINS,
    });
    if (!measured) throw new Error('the strip was not measured');
    const binCount = measured[0]?.length ?? 0;
    for (let bin = 0; bin < binCount; bin += 1) {
      const costs = measured.map((byBin) => byBin[bin]?.mismatch ?? Infinity);
      const best = shifts[costs.indexOf(Math.min(...costs))]?.along ?? NaN;
      expect(Math.abs(best - PAINTED_TURN_DEGREES)).toBeLessThanOrEqual(SWEEP_STEP_DEGREES + HAIR);
    }
  });

  it('measures more candidates than fit one batch, in their order', async () => {
    const { meter, backPose } = openScene();
    const count = MAX_CANDIDATES_PER_BATCH + 5;
    const measured = await meter.measure({
      lensIndex: 1,
      candidates: rotationsOf(Array.from({ length: count }, () => backPose)),
      gains: UNIT_GAINS,
    });
    expect(measured).toHaveLength(count);
    const costs = (measured ?? []).map((bins) => costOf(bins));
    for (const cost of costs) expect(cost).toBeCloseTo(costs[0] ?? NaN, 6);
  });

  it('refuses a lens the setup does not have', async () => {
    const { meter, backPose } = openScene();
    const request = { lensIndex: 2, candidates: rotationsOf([backPose]), gains: UNIT_GAINS };
    await expect(meter.measure(request)).rejects.toMatchObject({ code: 'index-out-of-range' });
  });

  it('measures nothing once disposed', async () => {
    const { meter, backPose } = openScene();
    meter.dispose();
    const request = { lensIndex: 1, candidates: rotationsOf([backPose]), gains: UNIT_GAINS };
    await expect(meter.measure(request)).resolves.toBeUndefined();
  });
});
