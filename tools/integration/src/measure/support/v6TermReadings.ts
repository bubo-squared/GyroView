import {
  RADIAL_AND_FIRST_PAIR,
  type V6DistortionTokens,
  type V6TermReading,
} from '@gyroview/core/testing';

/**
 * A reading of the v6 string's distortion tokens, named as the measurements report it.
 */
export interface NamedTermReading {
  readonly name: string;
  readonly reading: V6TermReading;
}

/**
 * Ways the v6 string's p3, p4 and s1 to s4 may be read, besides the player's own reading, which
 * leaves them out (ADR 0032): each a Mei distortion, so the renderer draws any of them. The
 * measurement keeps a reading only if it beats the player's on real footage.
 */
const RADIAL_ONLY: NamedTermReading = {
  name: 'radial terms only',
  reading: ({ radial }) => ({ radial, tangential: [], thinPrism: [] }),
};

const TWO_PAIRS: NamedTermReading = {
  name: 'two tangential orders',
  reading: (tokens) => ({ radial: tokens.radial, tangential: pairsOf(tokens), thinPrism: [] }),
};

const FIRST_PAIR_AND_PRISM: NamedTermReading = {
  name: "the first pair and OpenCV's thin prism",
  reading: (tokens) => ({
    ...RADIAL_AND_FIRST_PAIR(tokens),
    thinPrism: prismOf(tokens, 1),
  }),
};

const FIRST_PAIR_AND_NEGATED_PRISM: NamedTermReading = {
  name: 'the first pair and the thin prism negated',
  reading: (tokens) => ({
    ...RADIAL_AND_FIRST_PAIR(tokens),
    thinPrism: prismOf(tokens, -1),
  }),
};

const FIRST_PAIR_AND_SWAPPED_PRISM: NamedTermReading = {
  name: 'the first pair and the thin prism with its axes swapped',
  reading: (tokens) => ({
    ...RADIAL_AND_FIRST_PAIR(tokens),
    thinPrism: prismOf(tokens, 1).map(({ x, y }) => ({ x: y, y: x })),
  }),
};

const TWO_PAIRS_AND_PRISM: NamedTermReading = {
  name: "two tangential orders and OpenCV's thin prism",
  reading: (tokens) => ({
    radial: tokens.radial,
    tangential: pairsOf(tokens),
    thinPrism: prismOf(tokens, 1),
  }),
};

/**
 * `p1, p2` as the first tangential order and `p3, p4` as the second.
 */
function pairsOf({ tangential }: V6DistortionTokens): { p1: number; p2: number }[] {
  const [p1, p2, p3, p4] = tangential;
  return [
    { p1, p2 },
    { p1: p3, p2: p4 },
  ];
}

/**
 * OpenCV's thin prism: `s1 r² + s2 r⁴` along x, `s3 r² + s4 r⁴` along y, times `sign`.
 */
function prismOf({ thinPrism }: V6DistortionTokens, sign: number): { x: number; y: number }[] {
  const [s1, s2, s3, s4] = thinPrism;
  return [
    { x: sign * s1, y: sign * s3 },
    { x: sign * s2, y: sign * s4 },
  ];
}

export const V6_TERM_CANDIDATES: readonly NamedTermReading[] = [
  RADIAL_ONLY,
  TWO_PAIRS,
  FIRST_PAIR_AND_PRISM,
  FIRST_PAIR_AND_NEGATED_PRISM,
  FIRST_PAIR_AND_SWAPPED_PRISM,
  TWO_PAIRS_AND_PRISM,
];
