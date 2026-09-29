import { describe, expect, it } from 'vitest';

import { boxesIn, fullBoxOf, optionalBox, requiredBox } from './movieBoxes';
import { TIME_TO_SAMPLE } from './mp4Layouts';
import { readTableColumns } from './readTable';
import { encodeBox, encodeFullBox } from '../../../testing/encodeBox';
import { encodeTable } from '../../../testing/mp4/encodeTable';
import { captureError } from '../../../../test/support/errors';

describe('boxesIn', () => {
  it('lists the boxes one after another, each with the bytes after its header', () => {
    const bytes = Uint8Array.of(
      ...encodeBox('free', Uint8Array.of(1, 2)),
      ...encodeBox('skip', Uint8Array.of(3)),
    );
    const boxes = boxesIn(bytes);
    expect(boxes.map((box) => box.type)).toEqual(['free', 'skip']);
    expect([...(boxes[1]?.body ?? [])]).toEqual([3]);
  });

  it('refuses bytes that end inside a box', () => {
    const cut = encodeBox('trak', new Uint8Array(12)).subarray(0, 15);
    expect(captureError(() => boxesIn(cut))).toMatchObject({ code: 'unsupported-container' });
  });

  it('refuses a later box that runs past the end, and says where', () => {
    const second = encodeBox('trak', new Uint8Array(12)).subarray(0, 15);
    const bytes = Uint8Array.of(...encodeBox('free', Uint8Array.of(1)), ...second);
    expect(captureError(() => boxesIn(bytes))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('holds no box at byte 9 of 24') as string,
    });
  });

  it('lists a box of a header alone at the very end', () => {
    const bytes = Uint8Array.of(
      ...encodeBox('free', Uint8Array.of(1)),
      ...encodeBox('skip', new Uint8Array()),
    );
    expect(boxesIn(bytes).map((box) => box.type)).toEqual(['free', 'skip']);
  });

  it('leaves out fewer bytes at the end than a header takes, as padding', () => {
    const bytes = Uint8Array.of(...encodeBox('free', Uint8Array.of(1)), 0, 0, 0, 0);
    expect(boxesIn(bytes).map((box) => box.type)).toEqual(['free']);
  });

  it('finds the box of a type, or refuses a movie box without one it needs', () => {
    const boxes = boxesIn(encodeBox('mdhd', new Uint8Array(4)));
    expect(requiredBox(boxes, 'mdhd').type).toBe('mdhd');
    expect(optionalBox(boxes, 'elst')).toBeUndefined();
    expect(captureError(() => requiredBox(boxes, 'hdlr'))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('hdlr') as string,
    });
  });

  it('refuses a full box too short for its version and flags', () => {
    const [box] = boxesIn(encodeBox('mvhd', Uint8Array.of(0, 0, 0)));
    if (!box) throw new Error('no box');
    expect(captureError(() => fullBoxOf(box))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('mvhd box too short') as string,
    });
  });

  it('reads a full box: its version, then its content', () => {
    const [box] = boxesIn(encodeFullBox('tkhd', { version: 1, flags: 3 }, Uint8Array.of(9, 8)));
    if (!box) throw new Error('no box');
    const full = fullBoxOf(box);
    expect(full.version).toBe(1);
    expect(full.content.uint8At(0)).toBe(9);
    expect(full.content.length).toBe(2);
  });
});

describe('readTableColumns', () => {
  it('reads a table box into one column per field', () => {
    const rows = [
      { sampleCount: 3, sampleDelta: 1001 },
      { sampleCount: 1, sampleDelta: 500 },
    ];
    const [box] = boxesIn(encodeTable({ type: 'stts', version: 0, layout: TIME_TO_SAMPLE }, rows));
    if (!box) throw new Error('no box');
    expect(readTableColumns(fullBoxOf(box).content, TIME_TO_SAMPLE)).toEqual({
      sampleCount: [3, 1],
      sampleDelta: [1001, 500],
    });
  });

  it('refuses a table whose entries do not fit in its box', () => {
    const [box] = boxesIn(
      encodeTable({ type: 'stts', version: 0, layout: TIME_TO_SAMPLE }, [
        { sampleCount: 1, sampleDelta: 1 },
      ]),
    );
    if (!box) throw new Error('no box');
    const content = fullBoxOf({ ...box, body: box.body.subarray(0, -1) }).content;
    expect(captureError(() => readTableColumns(content, TIME_TO_SAMPLE))).toMatchObject({
      code: 'unsupported-container',
      message: expect.stringContaining('1 entries that do not fit') as string,
    });
  });
});
