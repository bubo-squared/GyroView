import { describe, expect, it } from 'vitest';

import { findBox, trailerWrapperOf } from './BoxLayout';
import { BoxType } from './boxConstants';
import { scanBoxes } from './scanBoxes';
import { InMemoryRandomAccessSource } from '../../../testing/InMemoryRandomAccessSource';
import { SparseRandomAccessSource } from '../../../testing/SparseRandomAccessSource';
import { encodeBox } from '../../../../test/support/encodeBox';
import { loadBoxHeaders } from '../../../../test/support/fixtures';

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

describe('scanBoxes on the real X5 layouts', () => {
  it.each(['office', 'sailing'] as const)(
    'finds ftyp, mdat, moov and inst in the %s recording',
    async (sample) => {
      const headers = loadBoxHeaders(sample);
      const source = new SparseRandomAccessSource(headers.fileSize);
      for (const entry of headers.boxes) source.place(entry.offset, hexToBytes(entry.headerHex));

      const layout = await scanBoxes(source);

      expect(layout.boxes.map((entry) => entry.type)).toEqual(['ftyp', 'mdat', 'moov', 'inst']);
      expect(
        layout.boxes.map((entry) => [entry.range.offset, entry.range.length, entry.headerSize]),
      ).toEqual(headers.boxes.map((entry) => [entry.offset, entry.size, entry.headerSize]));
      expect(layout.trailingBytes).toBeUndefined();
      expect(findBox(layout, BoxType.Movie)?.range.offset).toBe(headers.boxes[2]!.offset);
      expect(trailerWrapperOf(layout)).toBe('inst-box');
      expect(source.reads).toHaveLength(4);
    },
  );
});

describe('scanBoxes on synthetic files', () => {
  it('reports bytes after the last box as trailing bytes (bare trailer layout)', async () => {
    const file = new Uint8Array([
      ...encodeBox('ftyp', new Uint8Array(4)),
      ...encodeBox('moov', new Uint8Array(10)),
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
    ]);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(file));
    expect(layout.boxes.map((entry) => entry.type)).toEqual(['ftyp', 'moov']);
    expect(layout.trailingBytes).toMatchObject({ offset: 30, length: 5 });
    expect(trailerWrapperOf(layout)).toBe('bare');
  });

  it('does not mistake trailer bytes with a plausible size but a non-printable type for a box', async () => {
    const file = new Uint8Array([...encodeBox('ftyp', new Uint8Array(4)), 0, 0, 0, 8, 1, 2, 3, 4]);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(file));
    expect(layout.boxes.map((entry) => entry.type)).toEqual(['ftyp']);
    expect(layout.trailingBytes).toMatchObject({ offset: 12, length: 8 });
  });

  it('treats size zero as "to the end of the file"', async () => {
    const open = new Uint8Array(20);
    open.set(new TextEncoder().encode('mdat'), 4);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(open));
    expect(layout.boxes[0]).toMatchObject({ type: 'mdat', range: { offset: 0, length: 20 } });
    expect(layout.trailingBytes).toBeUndefined();
  });

  it('accepts a header-only box that ends exactly at the end of the file', async () => {
    const headerOnly = new InMemoryRandomAccessSource(encodeBox('free', new Uint8Array()));
    const layout = await scanBoxes(headerOnly);
    expect(layout.boxes).toHaveLength(1);
    expect(layout.trailingBytes).toBeUndefined();
  });

  it('stops at a box whose declared size is smaller than its header', async () => {
    const bogus = new Uint8Array([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76, 0, 0, 0, 0]);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(bogus));
    expect(layout.boxes).toEqual([]);
    expect(layout.trailingBytes).toMatchObject({ offset: 0, length: 12 });
  });

  it('stops at a large-size box whose 16-byte header is truncated', async () => {
    const truncated = new Uint8Array([0, 0, 0, 1, 0x6d, 0x64, 0x61, 0x74, 0, 0, 0, 0]);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(truncated));
    expect(layout.boxes).toEqual([]);
  });

  it('stops at a box that claims more bytes than the file has', async () => {
    const truncated = encodeBox('moov', new Uint8Array(10)).subarray(0, 12);
    const layout = await scanBoxes(new InMemoryRandomAccessSource(truncated));
    expect(layout.boxes).toEqual([]);
    expect(layout.trailingBytes).toMatchObject({ offset: 0, length: 12 });
  });

  it('scans an empty file to nothing', async () => {
    const layout = await scanBoxes(new InMemoryRandomAccessSource(new Uint8Array()));
    expect(layout).toEqual({ boxes: [], trailingBytes: undefined });
  });
});
