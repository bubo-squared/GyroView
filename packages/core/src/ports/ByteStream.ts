import type { ByteRange } from '../shared/binary/ByteRange';

/**
 * Port: a file's byte ranges as they arrive, for the download that reads a recording while it
 * plays. Unlike a {@link RandomAccessSource} read, a range is handed on piece by piece, so the
 * samples at its start are of use before its end has come, and it can be given up midway.
 */
export interface ByteStream {
  /**
   * The bytes of `range` in order, in chunks as they come, exactly `range.length` of them in
   * all; the adapter asks again for what fails on the way as its rules say. A range past the
   * end fails its first chunk with `invalid-byte-range`. Returning the iteration gives the range
   * up at once, even while a chunk is awaited, which then comes as the end.
   */
  stream(range: ByteRange): AsyncIterable<Uint8Array>;
}
