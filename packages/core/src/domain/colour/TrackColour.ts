/**
 * How a video track's samples encode colour, as its bitstream says: the HEVC or AVC VUI, or the
 * sample entry's `colr` box. Spelled as WebCodecs spells `VideoColorSpaceInit`, so an adapter
 * passes values through; `unspecified` where the track says nothing, or something the player
 * does not know.
 */
export type ColourPrimaries =
  'bt709' | 'bt470bg' | 'smpte170m' | 'bt2020' | 'smpte432' | 'unspecified';

export type TransferCharacteristics =
  'bt709' | 'smpte170m' | 'iec61966-2-1' | 'linear' | 'pq' | 'hlg' | 'unspecified';

export type MatrixCoefficients =
  'rgb' | 'bt709' | 'bt470bg' | 'smpte170m' | 'bt2020-ncl' | 'unspecified';

export type ColourRange = 'full' | 'limited' | 'unspecified';

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
