import {
  COLOUR_PRIMARIES,
  MATRIX_COEFFICIENTS,
  TRANSFER_CHARACTERISTICS,
  type ColourRange,
  type TrackColour,
} from '@gyroview/core';

/**
 * A track's colour in the core's terms, from the colour space mediabunny reads off its sample
 * entry or, without a `colr` box, its SPS: a value the core does not name is unspecified.
 */
export function trackColourOf(colorSpace: VideoColorSpaceInit | undefined): TrackColour {
  return {
    primaries: namedOrUnspecified(COLOUR_PRIMARIES, colorSpace?.primaries),
    transfer: namedOrUnspecified(TRANSFER_CHARACTERISTICS, colorSpace?.transfer),
    matrix: namedOrUnspecified(MATRIX_COEFFICIENTS, colorSpace?.matrix),
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
