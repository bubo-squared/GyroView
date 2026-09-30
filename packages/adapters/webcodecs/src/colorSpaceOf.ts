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
 * conversion was chosen for (ADR 0033). An engine whose WebCodecs does not know one of the values
 * would refuse the whole configuration, so it is told the range alone, as before. Undefined for a
 * track that names nothing.
 */
export function colorSpaceOf(colour: TrackColour): VideoColorSpaceInit | undefined {
  const range = colour.range === 'unspecified' ? undefined : { fullRange: colour.range === 'full' };
  const named: ColorSpaceInit = {
    ...(colour.primaries !== 'unspecified' && { primaries: colour.primaries }),
    ...(colour.transfer !== 'unspecified' && { transfer: colour.transfer }),
    ...(colour.matrix !== 'unspecified' && { matrix: colour.matrix }),
    ...range,
  };
  return Object.keys(named).length === 0
    ? undefined
    : (understoodHere(named as VideoColorSpaceInit) ?? range);
}

/**
 * The colour space as this engine reads it, undefined where it names a value the engine does not
 * know.
 */
function understoodHere(colorSpace: VideoColorSpaceInit): VideoColorSpaceInit | undefined {
  try {
    return new VideoColorSpace(colorSpace).toJSON();
  } catch {
    return undefined;
  }
}
