import { SparseRandomAccessSource } from './SparseRandomAccessSource';

/**
 * Test double: a source over bytes already in memory. A sparse source with one segment.
 */
export class InMemoryRandomAccessSource extends SparseRandomAccessSource {
  public constructor(bytes: Uint8Array) {
    super(bytes.byteLength);
    this.place(0, bytes);
  }
}
