import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seconds, type AudioSegmentSource, type AudioTrackReader } from '@gyroview/core';
import { InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { BufferSource, EncodedPacketSink, Input, MP4 } from 'mediabunny';
import { beforeAll, describe, expect, it } from 'vitest';

import { MediabunnyAudioSegmenter } from './MediabunnyAudioSegmenter';
import { MediabunnyDemuxer } from './MediabunnyDemuxer';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4',
);
const BOX_TYPE_OFFSET = 4;
const BOX_TYPE_LENGTH = 4;

function boxTypeOf(segment: Uint8Array): string {
  return new TextDecoder().decode(
    segment.subarray(BOX_TYPE_OFFSET, BOX_TYPE_OFFSET + BOX_TYPE_LENGTH),
  );
}

async function collect(
  segments: AsyncIterable<Uint8Array>,
  limit = Infinity,
): Promise<Uint8Array[]> {
  const taken: Uint8Array[] = [];
  for await (const segment of segments) {
    taken.push(segment);
    if (taken.length >= limit) break;
  }
  return taken;
}

function concat(segments: readonly Uint8Array[]): Uint8Array {
  const total = segments.reduce((sum, segment) => sum + segment.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const segment of segments) {
    bytes.set(segment, offset);
    offset += segment.byteLength;
  }
  return bytes;
}

async function parseBack(bytes: Uint8Array): Promise<{ duration: number; firstTimestamp: number }> {
  const input = new Input({ formats: [MP4], source: new BufferSource(bytes) });
  try {
    const [track] = await input.getAudioTracks();
    if (!track) throw new Error('no audio track in the re-packaged bytes');
    const first = await new EncodedPacketSink(track).getFirstPacket();
    return {
      duration: await input.computeDuration(),
      firstTimestamp: first?.timestamp ?? NaN,
    };
  } finally {
    input.dispose();
  }
}

describe('MediabunnyAudioSegmenter', () => {
  let track: AudioTrackReader;
  let source: AudioSegmentSource;

  beforeAll(async () => {
    const input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(readFileSync(FIXTURE)),
      'aac fixture',
    );
    const [audio] = input.audioTracks;
    if (!audio) throw new Error('fixture has no audio track');
    track = audio;
    source = await new MediabunnyAudioSegmenter().open(track);
  });

  it('describes the output as fragmented MP4 audio with the track codec', () => {
    expect(source.mimeType).toBe('audio/mp4; codecs="mp4a.40.2"');
    expect(source.duration).toBeCloseTo(3, 2);
  });

  it('emits the initialization segment first, then whole moof/mdat pairs', async () => {
    const segments = await collect(source.segmentsFrom(seconds(0)));
    const types = segments.map((segment) => boxTypeOf(segment));
    expect(types.slice(0, 2)).toEqual(['ftyp', 'moov']);
    expect(
      types.slice(2).filter((type, index) => type !== (index % 2 === 0 ? 'moof' : 'mdat')),
    ).toEqual([]);
    expect(types).not.toContain('mfra');
    expect(segments.length).toBeGreaterThanOrEqual(2 + 2 * 3);
  });

  it('re-packages the whole track so it parses back with the same duration', async () => {
    const segments = await collect(source.segmentsFrom(seconds(0)));
    const parsed = await parseBack(concat(segments));
    expect(parsed.duration).toBeCloseTo(3, 1);
    expect(parsed.firstTimestamp).toBeCloseTo(0, 3);
  });

  it('starts at the packet playing at the requested time and keeps the track timestamps', async () => {
    const segments = await collect(source.segmentsFrom(seconds(1.5)));
    const parsed = await parseBack(concat(segments));
    expect(parsed.firstTimestamp).toBeLessThanOrEqual(1.5);
    expect(parsed.firstTimestamp).toBeGreaterThan(1.4);
    expect(parsed.duration).toBeCloseTo(3, 1);
  });

  it('yields the init segment first, then fragments, as far as the consumer iterates', async () => {
    const segments = await collect(source.segmentsFrom(seconds(0)), 3);
    expect(segments.map((segment) => boxTypeOf(segment))).toEqual(['ftyp', 'moov', 'moof']);
  });
});
