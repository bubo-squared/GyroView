import { describe, expect, it } from 'vitest';

import { findBox } from './BoxLayout';
import { BoxScanner } from './BoxScanner';
import { BoxType } from './boxConstants';
import { InMemoryRandomAccessSource } from '../../../testing/InMemoryRandomAccessSource';
import { SparseRandomAccessSource } from '../../../testing/SparseRandomAccessSource';
import { loadBoxHeaders } from '../../../../test/support/fixtures';

const scanner = new BoxScanner();

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.byteLength);
  new DataView(bytes.buffer).setUint32(0, bytes.byteLength);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

describe('BoxScanner on the real X5 layouts', () => {
  it.each(['office', 'sailing'] as const)(
    'finds ftyp, mdat, moov and inst in the %s recording',
    async (sample) => {
      const headers = loadBoxHeaders(sample);
      const source = new SparseRandomAccessSource(headers.fileSize);
      for (const entry of headers.boxes) source.place(entry.offset, hexToBytes(entry.headerHex));

      const layout = await scanner.scan(source);

      expect(layout.boxes.map((entry) => entry.type)).toEqual(['ftyp', 'mdat', 'moov', 'inst']);
      expect(
        layout.boxes.map((entry) => [entry.range.offset, entry.range.length, entry.headerSize]),
      ).toEqual(headers.boxes.map((entry) => [entry.offset, entry.size, entry.headerSize]));
      expect(layout.trailingBytes).toBeUndefined();
      expect(findBox(layout, BoxType.Movie)?.range.offset).toBe(headers.boxes[2]!.offset);
      expect(findBox(layout, BoxType.Insta360Trailer)).toBeDefined();
      expect(source.reads).toHaveLength(4);
    },
  );
});

describe('BoxScanner on synthetic files', () => {
  it('reports bytes after the last box as trailing bytes (bare trailer layout)', async () => {
    const file = new Uint8Array([
      ...box('ftyp', new Uint8Array(4)),
      ...box('moov', new Uint8Array(10)),
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
    ]);
    const layout = await scanner.scan(new InMemoryRandomAccessSource(file));
    expect(layout.boxes.map((entry) => entry.type)).toEqual(['ftyp', 'moov']);
    expect(layout.trailingBytes).toMatchObject({ offset: 30, length: 5 });
  });

  it('treats size zero as "to the end of the file"', async () => {
    const open = new Uint8Array(20);
    open.set(new TextEncoder().encode('mdat'), 4);
    const layout = await scanner.scan(new InMemoryRandomAccessSource(open));
    expect(layout.boxes[0]).toMatchObject({ type: 'mdat', range: { offset: 0, length: 20 } });
    expect(layout.trailingBytes).toBeUndefined();
  });

  it('stops at a box that claims more bytes than the file has', async () => {
    const truncated = box('moov', new Uint8Array(10)).subarray(0, 12);
    const layout = await scanner.scan(new InMemoryRandomAccessSource(truncated));
    expect(layout.boxes).toEqual([]);
    expect(layout.trailingBytes).toMatchObject({ offset: 0, length: 12 });
  });

  it('scans an empty file to nothing', async () => {
    const layout = await scanner.scan(new InMemoryRandomAccessSource(new Uint8Array()));
    expect(layout).toEqual({ boxes: [], trailingBytes: undefined });
  });
});
