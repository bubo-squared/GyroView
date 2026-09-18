import type { ByteRange } from '../shared/binary/ByteRange';

/**
 * Anything the player can read bytes from at arbitrary positions: an HTTP URL that honours
 * Range requests, a local File, a Node file handle. Implementations live in adapters.
 */
export interface RandomAccessSource {
  /**
   * Total size in bytes. May require I/O (for example an HTTP HEAD request).
   */
  size(): Promise<number>;
  /**
   * Reads exactly `range.length` bytes; rejects if the range does not fit within the source.
   */
  read(range: ByteRange): Promise<Uint8Array>;
}
