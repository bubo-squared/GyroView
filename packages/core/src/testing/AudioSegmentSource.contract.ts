import { describe, expect, it } from 'vitest';

import type { AudioSegmentSource } from '../ports/AudioSegmentSource';
import { seconds } from '../shared/units/time';

const BOX_TYPE_OFFSET = 4;
const BOX_TYPE_LENGTH = 4;

const BOX_SIZE_LENGTH = 4;
const IS_BIG_ENDIAN = false;
/**
 * The segments read to check their shape: the initialization and a few media segments.
 */
const SEGMENTS_CHECKED = 4;

function boxTypeOf(segment: Uint8Array): string {
  const type = segment.subarray(BOX_TYPE_OFFSET, BOX_TYPE_OFFSET + BOX_TYPE_LENGTH);
  return String.fromCodePoint(...type);
}

/**
 * The types of a segment's top-level boxes, in order.
 */
function topLevelBoxTypesOf(segment: Uint8Array): string[] {
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const types: string[] = [];
  for (let at = 0; at + BOX_SIZE_LENGTH + BOX_TYPE_LENGTH <= segment.byteLength;) {
    const size = view.getUint32(at, IS_BIG_ENDIAN);
    types.push(boxTypeOf(segment.subarray(at)));
    if (size === 0) break;
    at += size;
  }
  return types;
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

    it('hands out whole segments, so a consumer may stop between any two', async () => {
      const source = await open();
      const segments = source.segmentsFrom(seconds(0))[Symbol.asyncIterator]();
      const shapes: string[][] = [];
      for (let next = await segments.next(); next.done !== true; next = await segments.next()) {
        shapes.push(topLevelBoxTypesOf(next.value));
        if (shapes.length === SEGMENTS_CHECKED) break;
      }
      await segments.return?.();
      const [initialization, ...media] = shapes;
      expect(initialization).toEqual(['ftyp', 'moov']);
      expect(media.length).toBeGreaterThan(0);
      for (const shape of media) expect(shape).toEqual(['moof', 'mdat']);
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
