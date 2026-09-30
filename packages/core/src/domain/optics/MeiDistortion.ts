import { ensureInvariant } from '../../shared/errors/GyroViewError';

/**
 * A point on the Mei model's normalised image plane, before the focal lengths scale it.
 */
export type NormalisedPoint = readonly [x: number, y: number];

/**
 * One order of Brown's decentering (tangential) distortion.
 */
export interface TangentialPair {
  readonly p1: number;
  readonly p2: number;
}

/**
 * One order of thin-prism distortion: a shift along each axis.
 */
export interface ThinPrismTerm {
  readonly x: number;
  readonly y: number;
}

/**
 * The distortion a Mei calibration string carries, as families of terms by increasing order,
 * so that every string version is the same model with more or fewer terms:
 *
 * - radial: `k1, k2, ...` in the factor `1 + k1 r² + k2 r⁴ + ...`;
 * - tangential: order `j` is Brown's decentering pair scaled by `r^(2j)`;
 * - thin prism: order `j` shifts the point by its term scaled by `r^(2j + 2)`.
 *
 * `offset_v3` fills three radial terms and one tangential order; which terms `offset_v6` fills
 * is the reading of ADR 0032.
 */
export interface MeiDistortion {
  readonly radial: readonly number[];
  readonly tangential: readonly TangentialPair[];
  readonly thinPrism: readonly ThinPrismTerm[];
}

/**
 * The most terms of each family a calibration string carries (`offset_v6`: five radial terms,
 * two tangential pairs, two thin-prism orders): what a renderer must hold room for.
 */
export const MEI_TERM_CAPACITY = {
  radial: 5,
  tangential: 2,
  thinPrism: 2,
} as const satisfies Readonly<Record<keyof MeiDistortion, number>>;

/**
 * Refuses a distortion with more terms of a family than {@link MEI_TERM_CAPACITY} holds: a
 * defect of the reading that made it, found where the string is read rather than when a
 * renderer packs it.
 */
export function ensureWithinTermCapacity(distortion: MeiDistortion): void {
  ensureFamilyFits('radial', distortion.radial.length);
  ensureFamilyFits('tangential', distortion.tangential.length);
  ensureFamilyFits('thinPrism', distortion.thinPrism.length);
}

function ensureFamilyFits(family: keyof MeiDistortion, count: number): void {
  const capacity = MEI_TERM_CAPACITY[family];
  ensureInvariant(
    count <= capacity,
    `a Mei distortion has ${count} ${family} terms, more than the ${capacity} a string carries`,
  );
}

export function distortMei(distortion: MeiDistortion, point: NormalisedPoint): NormalisedPoint {
  const [x, y] = point;
  const r2 = x * x + y * y;
  const radial = 1 + r2 * seriesIn(r2, distortion.radial, (k) => k);
  const p1 = seriesIn(r2, distortion.tangential, (pair) => pair.p1);
  const p2 = seriesIn(r2, distortion.tangential, (pair) => pair.p2);
  const prismX = r2 * seriesIn(r2, distortion.thinPrism, (term) => term.x);
  const prismY = r2 * seriesIn(r2, distortion.thinPrism, (term) => term.y);
  return [
    radial * x + 2 * p1 * x * y + p2 * (r2 + 2 * x * x) + prismX,
    radial * y + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y + prismY,
  ];
}

/**
 * `c0 + c1 r² + c2 r⁴ + ...` of the terms' coefficients, by Horner's rule.
 */
function seriesIn<Term>(
  r2: number,
  terms: readonly Term[],
  coefficientOf: (term: Term) => number,
): number {
  return terms.reduceRight((sum, term) => sum * r2 + coefficientOf(term), 0);
}
