import type { MeiDistortion } from '../../optics/MeiDistortion';

/**
 * The thirteen distortion tokens of one `offset_v6` lens block, in the string's order.
 */
export interface V6DistortionTokens {
  readonly radial: readonly [k1: number, k2: number, k3: number, k4: number, k5: number];
  readonly tangential: readonly [p1: number, p2: number, p3: number, p4: number];
  readonly thinPrism: readonly [s1: number, s2: number, s3: number, s4: number];
}

/**
 * One way of reading the v6 string's distortion tokens into the Mei distortion: which terms the
 * lens is drawn with, and in which role (ADR 0032).
 */
export interface V6TermReading {
  readonly name: string;
  distortionOf(tokens: V6DistortionTokens): MeiDistortion;
}

/**
 * The five radial terms and the first tangential pair, the terms v3 carries too and reads the
 * same way: on the X5, whose v3 and v6 strings describe the same lenses, this reading draws
 * v3's image to about two canvas pixels. `p3`, `p4` and `s1` to `s4` are left out until real
 * footage says how Insta360's stitch reads them.
 */
export const RADIAL_AND_FIRST_PAIR: V6TermReading = {
  name: 'radial terms and the first tangential pair',
  distortionOf: ({ radial, tangential }) => {
    const [p1, p2] = tangential;
    return { radial, tangential: [{ p1, p2 }], thinPrism: [] };
  },
};

/**
 * The reading the player draws v6 lenses with (ADR 0032, provisional).
 */
export const V6_TERM_READING = RADIAL_AND_FIRST_PAIR;
