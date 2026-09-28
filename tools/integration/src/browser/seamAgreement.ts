import type { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  correctedLensRotation,
  DEFAULT_MAX_GAIN,
  gainsMatching,
  searchPose,
  seamCostOf,
  type CostEvaluator,
  type FramePair,
  type Matrix3,
  type PoseSearchResult,
  type SeamMismatchMeter,
  type Vector3,
} from '@gyroview/core';

/**
 * The lens whose pose the search turns: the back lens, as omnikit refines it. Lens 0 is the
 * reference the viewer starts facing and the gain matching's reference too.
 */
export const REFINED_LENS = 1;
const UNIT_GAIN: Vector3 = [1, 1, 1];
const UNIT_GAINS: readonly Vector3[] = [UNIT_GAIN, UNIT_GAIN];

export interface SeamMoment {
  readonly time: number;
  readonly pair: FramePair<VideoFrame>;
}

/**
 * What measuring a sample's seam needs: a renderer showing its frames, a mismatch meter over
 * it, and the refined lens's factory pose the candidates turn from.
 */
export interface SeamAgreementParts {
  readonly renderer: ThreeFrameRenderer;
  readonly meter: SeamMismatchMeter;
  readonly factoryPose: Matrix3;
}

/**
 * What one moment shows: the gains that match the lenses' exposure there, how the lenses
 * disagree at the factory pose, bin by bin, and the pose the search found for this moment
 * alone.
 */
export interface MomentAgreement {
  readonly time: number;
  readonly gains: readonly Vector3[];
  readonly factoryCost: number | undefined;
  readonly mismatchByBin: readonly number[];
  readonly validityByBin: readonly number[];
  readonly search: PoseSearchResult;
}

export function showPair(parts: SeamAgreementParts, pair: FramePair<VideoFrame>): void {
  parts.renderer.present({ pair, mediaTime: pair.timestamp });
}

/**
 * The gains the picture's matching would apply to the frames on screen (ADR 0012), so the
 * costs measure alignment, not exposure.
 */
export async function gainsOf(renderer: ThreeFrameRenderer): Promise<readonly Vector3[]> {
  const meter = renderer.createSeamMeter();
  try {
    const means = await meter.measure();
    return means ? gainsMatching(means, DEFAULT_MAX_GAIN) : UNIT_GAINS;
  } finally {
    meter.dispose();
  }
}

/**
 * The ring's cost of each candidate delta over the frames on screen; infinity where the strip
 * could not be measured.
 */
export function costEvaluatorOf(
  parts: SeamAgreementParts,
  gains: readonly Vector3[],
): CostEvaluator {
  return async (candidates) => {
    const rotations = candidates.map((delta) => correctedLensRotation(parts.factoryPose, delta));
    const measured = await parts.meter.measure({ lensIndex: REFINED_LENS, rotations, gains });
    return measured
      ? measured.map((bins) => seamCostOf(bins) ?? Infinity)
      : candidates.map(() => Infinity);
  };
}

export async function factoryCostOf(
  parts: SeamAgreementParts,
  pair: FramePair<VideoFrame>,
  gains: readonly Vector3[],
): Promise<number | undefined> {
  showPair(parts, pair);
  const [bins] =
    (await parts.meter.measure({
      lensIndex: REFINED_LENS,
      rotations: [parts.factoryPose],
      gains,
    })) ?? [];
  return bins ? seamCostOf(bins) : undefined;
}

export async function measureMoment(
  parts: SeamAgreementParts,
  moment: SeamMoment,
): Promise<MomentAgreement> {
  showPair(parts, moment.pair);
  const gains = await gainsOf(parts.renderer);
  const [bins] =
    (await parts.meter.measure({
      lensIndex: REFINED_LENS,
      rotations: [parts.factoryPose],
      gains,
    })) ?? [];
  const search = await searchPose(costEvaluatorOf(parts, gains));
  return {
    time: moment.time,
    gains,
    factoryCost: bins ? seamCostOf(bins) : undefined,
    mismatchByBin: bins?.map((bin) => bin.mismatch) ?? [],
    validityByBin: bins?.map((bin) => bin.validity) ?? [],
    search,
  };
}

/**
 * The search over several moments at once: a candidate's cost is its mean over the moments,
 * each moment's pair shown in turn for every batch of candidates.
 */
export function searchJointly(
  parts: SeamAgreementParts,
  moments: readonly SeamMoment[],
  gainsByMoment: readonly (readonly Vector3[])[],
): Promise<PoseSearchResult> {
  return searchPose(async (candidates) => {
    const totals = candidates.map(() => 0);
    for (const [index, moment] of moments.entries()) {
      showPair(parts, moment.pair);
      const evaluate = costEvaluatorOf(parts, gainsByMoment[index] ?? UNIT_GAINS);
      const costs = await evaluate(candidates);
      for (const [candidate, cost] of costs.entries()) {
        totals[candidate] = (totals[candidate] ?? 0) + cost;
      }
    }
    return totals.map((total) => total / moments.length);
  });
}
