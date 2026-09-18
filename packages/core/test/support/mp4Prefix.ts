import { encodeBox } from './encodeBox';

/**
 * The smallest sequence of bytes the box scanner accepts as an MP4 body: an `ftyp` and an empty
 * `moov`. Stands in for the media data in trailer tests.
 */
export function minimalMp4Prefix(): Uint8Array {
  return new Uint8Array([
    ...encodeBox('ftyp', new TextEncoder().encode('isom')),
    ...encodeBox('moov', new Uint8Array()),
  ]);
}
