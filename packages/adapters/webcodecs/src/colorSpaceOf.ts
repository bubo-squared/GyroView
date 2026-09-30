import type { TrackColour } from '@gyroview/core';

/**
 * `VideoColorSpaceInit` as the WebCodecs specification has it now: TypeScript's DOM library still
 * lacks BT.2020, P3, PQ, HLG, linear light and BT.2020's matrix.
 */
interface ColorSpaceInit {
  primaries?: string;
  transfer?: string;
  matrix?: string;
  fullRange?: boolean;
}

/**
 * A track's colour as a decoder configuration's colour space: every value the track names, none
 * it leaves unspecified. WebCodecs gives the frames the configured colour space whole ("Output
 * VideoFrames"), so it says all the bitstream says, and the frames carry the colour the display
 * conversion was chosen for (ADR 0033).
 */
export function colorSpaceOf(colour: TrackColour): VideoColorSpaceInit {
  const colorSpace: ColorSpaceInit = {
    ...(colour.primaries !== 'unspecified' && { primaries: colour.primaries }),
    ...(colour.transfer !== 'unspecified' && { transfer: colour.transfer }),
    ...(colour.matrix !== 'unspecified' && { matrix: colour.matrix }),
    ...(colour.range !== 'unspecified' && { fullRange: colour.range === 'full' }),
  };
  return colorSpace as VideoColorSpaceInit;
}
