import type {
  ColourPrimaries,
  ColourRange,
  MatrixCoefficients,
  TrackColour,
  TransferCharacteristics,
} from '@gyroview/core';

const PRIMARIES: readonly ColourPrimaries[] = [
  'bt709',
  'bt470bg',
  'smpte170m',
  'bt2020',
  'smpte432',
];
const TRANSFERS: readonly TransferCharacteristics[] = [
  'bt709',
  'smpte170m',
  'iec61966-2-1',
  'linear',
  'pq',
  'hlg',
];
const MATRICES: readonly MatrixCoefficients[] = [
  'rgb',
  'bt709',
  'bt470bg',
  'smpte170m',
  'bt2020-ncl',
];

/**
 * A track's colour in the core's terms, from the colour space mediabunny reads off its sample
 * entry or, without a `colr` box, its SPS: a value the core does not name is unspecified.
 */
export function trackColourOf(colorSpace: VideoColorSpaceInit | undefined): TrackColour {
  return {
    primaries: namedOrUnspecified(PRIMARIES, colorSpace?.primaries),
    transfer: namedOrUnspecified(TRANSFERS, colorSpace?.transfer),
    matrix: namedOrUnspecified(MATRICES, colorSpace?.matrix),
    range: rangeOf(colorSpace?.fullRange),
  };
}

function namedOrUnspecified<Name extends string>(
  names: readonly Name[],
  value: string | null | undefined,
): Name | 'unspecified' {
  return names.find((name) => name === value) ?? 'unspecified';
}

function rangeOf(fullRange: boolean | null | undefined): ColourRange {
  if (fullRange === true) return 'full';
  return fullRange === false ? 'limited' : 'unspecified';
}
