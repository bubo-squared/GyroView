import { describe, expect, it } from 'vitest';

import { BlockStore } from './BlockStore';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';

function countingFrom(start: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) % 256);
}

function spansOf(set: ByteRangeSet): [number, number][] {
  return set.ranges.map((range) => [range.offset, range.end]);
}

describe('BlockStore', () => {
  it('holds a block only as far as its bytes have come', () => {
    const store = new BlockStore();
    const block = store.allocate(ByteRange.of(100, 50));
    expect(store.held.isEmpty).toBe(true);
    store.write(block, countingFrom(100, 20));
    expect(spansOf(store.held)).toEqual([[100, 120]]);
    store.write(block, countingFrom(120, 30));
    expect(spansOf(store.held)).toEqual([[100, 150]]);
  });

  it('counts the bytes it allocated, come or not', () => {
    const store = new BlockStore();
    store.allocate(ByteRange.of(0, 50));
    store.allocate(ByteRange.of(50, 30));
    expect(store.allocatedBytes).toBe(80);
  });

  it('hands out a range within one block as a view of it', () => {
    const store = new BlockStore();
    const block = store.allocate(ByteRange.of(100, 50));
    store.write(block, countingFrom(100, 50));
    const bytes = store.bytesOf(ByteRange.of(110, 5));
    expect([...(bytes ?? [])]).toEqual([110, 111, 112, 113, 114]);
    expect(bytes?.buffer.byteLength).toBe(50);
  });

  it('copies a range out of the blocks it spans', () => {
    const store = new BlockStore();
    const first = store.allocate(ByteRange.of(0, 10));
    const second = store.allocate(ByteRange.of(10, 10));
    store.write(first, countingFrom(0, 10));
    store.write(second, countingFrom(10, 10));
    expect([...(store.bytesOf(ByteRange.of(8, 4)) ?? [])]).toEqual([8, 9, 10, 11]);
  });

  it('has no bytes for a range not all come', () => {
    const store = new BlockStore();
    const block = store.allocate(ByteRange.of(0, 10));
    store.write(block, countingFrom(0, 5));
    expect(store.bytesOf(ByteRange.of(3, 4))).toBeUndefined();
    expect(store.bytesOf(ByteRange.of(50, 4))).toBeUndefined();
  });

  it('keeps of a block given up only what came, and frees the rest', () => {
    const store = new BlockStore();
    const block = store.allocate(ByteRange.of(0, 100));
    store.write(block, countingFrom(0, 30));
    store.trim(block);
    expect(store.allocatedBytes).toBe(30);
    expect(spansOf(store.held)).toEqual([[0, 30]]);
    expect([...(store.bytesOf(ByteRange.of(28, 2)) ?? [])]).toEqual([28, 29]);
  });

  it('drops a trimmed block that got nothing', () => {
    const store = new BlockStore();
    store.trim(store.allocate(ByteRange.of(0, 100)));
    expect(store.allocatedBytes).toBe(0);
  });

  it('lets go of no block still filling, however much of it is released', () => {
    const store = new BlockStore();
    const filling = store.allocate(ByteRange.of(0, 10));
    store.write(filling, countingFrom(0, 4));
    store.release(ByteRangeSet.of([ByteRange.of(0, 100)]));
    store.write(filling, countingFrom(4, 6));
    expect(store.allocatedBytes).toBe(10);
    expect(spansOf(store.held)).toEqual([[0, 10]]);
  });

  it('lets go of the blocks whose every byte is released, and keeps those partly wanted', () => {
    const store = new BlockStore();
    for (const offset of [0, 10, 20]) {
      const block = store.allocate(ByteRange.of(offset, 10));
      store.write(block, countingFrom(offset, 10));
      store.complete(block);
    }
    store.release(ByteRangeSet.of([ByteRange.of(0, 15), ByteRange.of(20, 10)]));
    expect(spansOf(store.held)).toEqual([[10, 20]]);
    expect(store.allocatedBytes).toBe(10);
  });
});
