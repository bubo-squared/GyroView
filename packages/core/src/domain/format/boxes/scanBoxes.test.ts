import { describe, expect, it } from 'vitest';

import { trailerWrapperOf } from './BoxLayout';
import { scanBoxes } from './scanBoxes';
import { InMemoryRandomAccessSource } from '../../../testing/InMemoryRandomAccessSource';
import { SparseRandomAccessSource } from '../../../testing/SparseRandomAccessSource';
import { encodeBox } from '../../../testing/encodeBox';
import { loadBoxHeaders } from '../../../../test/support/fixtures';

function scanFile(bytes: Uint8Array): ReturnType<typeof scanBoxes> {
  return scanBoxes(new InMemoryRandomAccessSource(bytes), bytes.byteLength);
}

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

      const boxes = await scanBoxes(source, headers.fileSize);

      expect(boxes.map((entry) => entry.type)).toEqual(['ftyp', 'mdat', 'moov', 'inst']);
      expect(boxes.map((entry) => [entry.range.offset, entry.range.length])).toEqual(
        headers.boxes.map((entry) => [entry.offset, entry.size]),
      );
      expect(trailerWrapperOf(boxes)).toBe('inst-box');
      expect(source.reads).toHaveLength(4);
    },
  );
});

describe('scanBoxes on synthetic files', () => {
  it('stops after the last box, before a bare trailer', async () => {
    const file = new Uint8Array([
      ...encodeBox('ftyp', new Uint8Array(4)),
      ...encodeBox('moov', new Uint8Array(10)),
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
    ]);
    const boxes = await scanFile(file);
    expect(boxes.map((entry) => entry.type)).toEqual(['ftyp', 'moov']);
    expect(trailerWrapperOf(boxes)).toBe('bare');
  });

  it('does not mistake trailer bytes with a plausible size but a non-printable type for a box', async () => {
    const file = new Uint8Array([...encodeBox('ftyp', new Uint8Array(4)), 0, 0, 0, 8, 1, 2, 3, 4]);
    const boxes = await scanFile(file);
    expect(boxes.map((entry) => entry.type)).toEqual(['ftyp']);
  });

  it('treats size zero as "to the end of the file"', async () => {
    const open = new Uint8Array(20);
    open.set(new TextEncoder().encode('mdat'), 4);
    const boxes = await scanFile(open);
    expect(boxes[0]).toMatchObject({ type: 'mdat', range: { offset: 0, length: 20 } });
  });

  it('accepts a header-only box that ends exactly at the end of the file', async () => {
    const headerOnly = new InMemoryRandomAccessSource(encodeBox('free', new Uint8Array()));
    const boxes = await scanBoxes(headerOnly, encodeBox('free', new Uint8Array()).byteLength);
    expect(boxes).toHaveLength(1);
  });

  it('stops at a box whose declared size is smaller than its header', async () => {
    const bogus = new Uint8Array([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76, 0, 0, 0, 0]);
    const boxes = await scanFile(bogus);
    expect(boxes).toEqual([]);
  });

  it('treats a large-size header whose size is not a safe integer as trailer bytes', async () => {
    const bogus = new Uint8Array([
      0, 0, 0, 1, 0x61, 0x62, 0x63, 0x64, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    const file = new Uint8Array([...encodeBox('ftyp', new Uint8Array(4)), ...bogus]);
    const boxes = await scanFile(file);
    expect(boxes.map((entry) => entry.type)).toEqual(['ftyp']);
  });

  it('stops at a large-size box whose 16-byte header is truncated', async () => {
    const truncated = new Uint8Array([0, 0, 0, 1, 0x6d, 0x64, 0x61, 0x74, 0, 0, 0, 0]);
    const boxes = await scanFile(truncated);
    expect(boxes).toEqual([]);
  });

  it('stops at a box that claims more bytes than the file has', async () => {
    const truncated = encodeBox('moov', new Uint8Array(10)).subarray(0, 12);
    const boxes = await scanFile(truncated);
    expect(boxes).toEqual([]);
  });

  it('scans an empty file to nothing', async () => {
    const boxes = await scanFile(new Uint8Array());
    expect(boxes).toEqual([]);
  });
});
