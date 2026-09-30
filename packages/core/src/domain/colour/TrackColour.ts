/**
 * The values a video track's colour can name, as its bitstream says: the HEVC or AVC VUI, or the
 * sample entry's `colr` box. Spelled as WebCodecs spells `VideoColorSpaceInit`, so an adapter
 * passes values through; `unspecified` where the track says nothing, or something the player
 * does not know.
 */
export const COLOUR_PRIMARIES = ['bt709', 'bt470bg', 'smpte170m', 'bt2020', 'smpte432'] as const;

export const TRANSFER_CHARACTERISTICS = [
  'bt709',
  'smpte170m',
  'iec61966-2-1',
  'linear',
  'pq',
  'hlg',
] as const;

export const MATRIX_COEFFICIENTS = ['rgb', 'bt709', 'bt470bg', 'smpte170m', 'bt2020-ncl'] as const;

type Unspecified = 'unspecified';

export type ColourPrimaries = (typeof COLOUR_PRIMARIES)[number] | Unspecified;

export type TransferCharacteristics = (typeof TRANSFER_CHARACTERISTICS)[number] | Unspecified;

export type MatrixCoefficients = (typeof MATRIX_COEFFICIENTS)[number] | Unspecified;

export type ColourRange = 'full' | 'limited' | Unspecified;

export interface TrackColour {
  readonly primaries: ColourPrimaries;
  readonly transfer: TransferCharacteristics;
  readonly matrix: MatrixCoefficients;
  readonly range: ColourRange;
}

/**
 * A track that says nothing of its colour.
 */
export const UNSPECIFIED_COLOUR: TrackColour = {
  primaries: 'unspecified',
  transfer: 'unspecified',
  matrix: 'unspecified',
  range: 'unspecified',
};

/**
 * A value as WebCodecs spells it, as the core names it: one of `names`, or unspecified for any
 * other value or none.
 */
export function namedOrUnspecified<Name extends string>(
  names: readonly Name[],
  value: string | null | undefined,
): Name | Unspecified {
  return names.find((name) => name === value) ?? 'unspecified';
}
