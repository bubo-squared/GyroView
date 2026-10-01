import { describe, expect, it } from 'vitest';

import { boxesIn } from '../domain/format/mp4/movieBoxes';
import type { AudioSegmentSource } from '../ports/AudioSegmentSource';
import { seconds } from '../shared/units/time';

const BOX_TYPE_OFFSET = 4;
const BOX_TYPE_LENGTH = 4;

/**
 * The segments read to check their shape: the initialization and a few media segments.
 */
const SEGMENTS_CHECKED = 4;
/**
 * Where a run starts that the shape is checked on as well: a seek's, mid-track.
 */
const MID_TRACK = 0.5;

function boxTypeOf(segment: Uint8Array): string {
  const type = segment.subarray(BOX_TYPE_OFFSET, BOX_TYPE_OFFSET + BOX_TYPE_LENGTH);
  return String.fromCodePoint(...type);
}

interface SegmentShape {
  readonly types: readonly string[];
  /**
   * Whether the boxes end exactly where the segment does: none cut short, nothing after them.
   */
  readonly isFilled: boolean;
}

function shapeOf(segment: Uint8Array): SegmentShape {
  const boxes = boxesIn(segment);
  const last = boxes.at(-1);
  const end = last ? last.body.byteOffset + last.body.byteLength - segment.byteOffset : 0;
  return { types: boxes.map((box) => box.type), isFilled: end === segment.byteLength };
}

async function shapesFrom(source: AudioSegmentSource, from: number): Promise<SegmentShape[]> {
  const segments = source.segmentsFrom(seconds(from))[Symbol.asyncIterator]();
  const shapes: SegmentShape[] = [];
  for (let next = await segments.next(); next.done !== true; next = await segments.next()) {
    shapes.push(shapeOf(next.value));
    if (shapes.length === SEGMENTS_CHECKED) break;
  }
  await segments.return?.();
  return shapes;
}

export interface AudioSegmentSourceExpectations {
  /**
   * The track's duration, in seconds.
   */
  readonly duration: number;
}

/**
 * The AudioSegmentSource port contract, run against every implementation over an audio track of
 * `duration` seconds.
 */
export function describeAudioSegmentSourceContract(
  name: string,
  open: () => Promise<AudioSegmentSource>,
  expected: AudioSegmentSourceExpectations,
): void {
  describe(`AudioSegmentSource contract (${name})`, () => {
    it('names its segments as MP4 audio with the codec, and tells the duration', async () => {
      const source = await open();
      expect(source.mimeType).toMatch(/^audio\/mp4; codecs="[^"]+"$/u);
      expect(source.duration).toBeCloseTo(expected.duration, 1);
    });

    it('hands out the initialization segment first', async () => {
      const source = await open();
      const segments = source.segmentsFrom(seconds(0))[Symbol.asyncIterator]();
      const first = await segments.next();
      await segments.return?.();
      expect(first.done === true ? undefined : boxTypeOf(first.value)).toBe('ftyp');
    });

    it('hands out whole segments, from the start or mid-track, so a consumer may stop between any two', async () => {
      const source = await open();
      for (const from of [0, expected.duration * MID_TRACK]) {
        const [initialization, ...media] = await shapesFrom(source, from);
        expect(initialization?.types.slice(0, 1)).toEqual(['ftyp']);
        expect(initialization?.types).toContain('moov');
        expect(initialization?.isFilled).toBe(true);
        expect(media.length).toBeGreaterThan(0);
        for (const { types, isFilled } of media) {
          expect(types.includes('moof') && types.at(-1) === 'mdat' && isFilled).toBe(true);
        }
      }
    });

    it('ends at once when returned, a segment still awaited coming as the end', async () => {
      const source = await open();
      const segments = source.segmentsFrom(seconds(0))[Symbol.asyncIterator]();
      await segments.next();
      const awaited = segments.next();
      await expect(segments.return?.()).resolves.toMatchObject({ done: true });
      await expect(awaited).resolves.toMatchObject({ done: true });
      await expect(segments.next()).resolves.toMatchObject({ done: true });
    });
  });
}
