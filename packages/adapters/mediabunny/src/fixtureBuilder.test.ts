import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  audioSampleEntry,
  buildMp4File,
  videoSampleEntry,
  type FixtureTrack,
  type Mp4FileLayout,
} from '@gyroview/core/testing';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input, type InputTrack } from 'mediabunny';
import { describe, expect, it } from 'vitest';

/**
 * The fixture builder writes the byte layouts the core's sample table parser reads, with the
 * same constants; mediabunny reading its files as the builder meant them is what tells both
 * that the layouts are the standard's.
 */

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4',
);
const VIDEO_TIMESCALE = 10_240;
const FRAME_DURATION = 1024;
const AUDIO_TIMESCALE = 48_000;
const AUDIO_FRAME_DURATION = 1024;
const MOVIE_TIMESCALE = 1000;

/**
 * The whole box of the given type: the first place its type appears, with the size before it.
 * Enough for the codec configuration boxes of a small ffmpeg file.
 */
function boxOf(file: Uint8Array, type: string): Uint8Array {
  const typeCode = new TextEncoder().encode(type);
  const at = file.findIndex((_, index) => typeCode.every((byte, k) => file[index + k] === byte));
  const start = at - 4;
  const size = new DataView(file.buffer, file.byteOffset + start, 4).getUint32(0);
  return file.slice(start, start + size);
}

const ffmpegFile = new Uint8Array(readFileSync(FIXTURE));
const AVC_CONFIGURATION = boxOf(ffmpegFile, 'avcC');
const AAC_CONFIGURATION = boxOf(ffmpegFile, 'esds');

function videoTrack(overrides: Partial<FixtureTrack> = {}): FixtureTrack {
  return {
    trackId: 1,
    handler: 'vide',
    sampleEntry: videoSampleEntry({
      type: 'avc1',
      width: 64,
      height: 64,
      configuration: AVC_CONFIGURATION,
    }),
    timescale: VIDEO_TIMESCALE,
    samples: Array.from({ length: 12 }, (_, index) => ({
      bytes: new Uint8Array(20 + index).fill(index + 1),
      duration: FRAME_DURATION,
      isSync: index % 5 === 0,
    })),
    ...overrides,
  };
}

function audioTrack(): FixtureTrack {
  return {
    trackId: 2,
    handler: 'soun',
    sampleEntry: audioSampleEntry({
      type: 'mp4a',
      channelCount: 2,
      sampleRate: AUDIO_TIMESCALE,
      configuration: AAC_CONFIGURATION,
    }),
    timescale: AUDIO_TIMESCALE,
    samples: Array.from({ length: 12 }, (_, index) => ({
      bytes: new Uint8Array(7).fill(100 + index),
      duration: AUDIO_FRAME_DURATION,
      isSync: true,
    })),
    syncSamples: 'unlisted',
  };
}

interface ReadPacket {
  readonly timestamp: number;
  readonly duration: number;
  readonly isKey: boolean;
  readonly data: number[];
}

async function packetsOf(track: InputTrack): Promise<ReadPacket[]> {
  const packets: ReadPacket[] = [];
  const all = new EncodedPacketSink(track).packets();
  for await (const packet of all) {
    packets.push({
      timestamp: packet.timestamp,
      duration: packet.duration,
      isKey: packet.type === 'key',
      data: [...packet.data],
    });
  }
  return packets;
}

async function readTracks(
  bytes: Uint8Array,
): Promise<{ video: ReadPacket[][]; audio: ReadPacket[][] }> {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  try {
    const [videoTracks, audioTracks] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
    ]);
    const video = await Promise.all(videoTracks.map((track) => packetsOf(track)));
    const audio = await Promise.all(audioTracks.map((track) => packetsOf(track)));
    return { video, audio };
  } finally {
    input.dispose();
  }
}

interface Shift {
  /**
   * Where an empty edit puts the media on the timeline, in seconds.
   */
  readonly startSeconds?: number;
  /**
   * The media time an edit shows from, in the track's timescale.
   */
  readonly mediaTime?: number;
}

/**
 * What the track's packets must read as, in decode order: each shown at its decode time plus its
 * composition offset, less the edit's media time (in ticks, divided once), after an empty edit;
 * each lasting until the next one shows, and the last one shown for its own decode duration.
 */
function expectedPackets(track: FixtureTrack, shift: Shift = {}): ReadPacket[] {
  const presentations = presentationTicksOf(track, shift.mediaTime ?? 0);
  const inOrder = presentations.toSorted((left, right) => left - right);
  return track.samples.map((sample, index) => {
    const ticks = presentations[index] ?? 0;
    const next = inOrder.find((other) => other > ticks);
    return {
      timestamp: ticks / track.timescale + (shift.startSeconds ?? 0),
      duration: (next === undefined ? sample.duration : next - ticks) / track.timescale,
      isKey: sample.isSync,
      data: [...sample.bytes],
    };
  });
}

function presentationTicksOf(track: FixtureTrack, mediaTime: number): number[] {
  let decodeTime = 0;
  return track.samples.map((sample) => {
    const ticks = decodeTime + (sample.compositionOffset ?? 0) - mediaTime;
    decodeTime += sample.duration;
    return ticks;
  });
}

const LAYOUTS: readonly (readonly [string, Partial<Mp4FileLayout>])[] = [
  ['the movie after the media, as the cameras write it', {}],
  ['the movie before the media', { movieBox: 'before-media' }],
  ['64-bit sizes and chunk offsets', { mediaDataSize: '64-bit', chunkOffsets: '64-bit' }],
  ['version 1 headers', { headerVersion: 1 }],
];

describe('mediabunny reads the files the MP4 fixture builder writes', () => {
  it.each(LAYOUTS)('with %s', async (_, layout) => {
    const tracks = [videoTrack(), audioTrack()];
    const read = await readTracks(
      buildMp4File(tracks, { movieTimescale: MOVIE_TIMESCALE, ...layout }).bytes,
    );
    expect(read.video).toEqual([expectedPackets(tracks[0] ?? videoTrack())]);
    expect(read.audio).toEqual([expectedPackets(tracks[1] ?? audioTrack())]);
  });

  it('with several samples to a chunk, in chunks of changing size', async () => {
    const video = videoTrack({ chunkSizes: [2, 1, 3] });
    const read = await readTracks(buildMp4File([video, audioTrack()]).bytes);
    expect(read.video).toEqual([expectedPackets(video)]);
  });

  it('with two video tracks interleaved, as a dual-lens recording has them', async () => {
    const lenses = [videoTrack(), videoTrack({ trackId: 3 })];
    const read = await readTracks(buildMp4File(lenses).bytes);
    expect(read.video).toEqual(lenses.map((lens) => expectedPackets(lens)));
  });

  it('with composition offsets in version 0', async () => {
    const video = videoTrack({
      compositionOffsets: 'version-0',
      samples: videoTrack().samples.map((sample) => ({
        ...sample,
        compositionOffset: FRAME_DURATION,
      })),
    });
    const read = await readTracks(buildMp4File([video]).bytes);
    expect(read.video).toEqual([expectedPackets(video)]);
  });

  it('with composition offsets in version 1, negative where a frame shows before it decodes', async () => {
    const video = videoTrack({
      compositionOffsets: 'version-1',
      samples: videoTrack().samples.map((sample, index) => ({
        ...sample,
        compositionOffset: index % 2 === 0 ? FRAME_DURATION : -FRAME_DURATION / 2,
      })),
    });
    const read = await readTracks(buildMp4File([video]).bytes);
    expect(read.video).toEqual([expectedPackets(video)]);
  });

  it('with an edit list that shows the media from a later media time', async () => {
    const video = videoTrack({ edits: [{ segmentDuration: 1000, mediaTime: 2 * FRAME_DURATION }] });
    const read = await readTracks(buildMp4File([video], { movieTimescale: MOVIE_TIMESCALE }).bytes);
    expect(read.video).toEqual([expectedPackets(video, { mediaTime: 2 * FRAME_DURATION })]);
  });

  it('with an edit list that starts the media later on the timeline', async () => {
    const emptyMilliseconds = 250;
    const video = videoTrack({
      edits: [
        { segmentDuration: emptyMilliseconds, mediaTime: -1 },
        { segmentDuration: 1200, mediaTime: 0 },
      ],
    });
    const read = await readTracks(buildMp4File([video], { movieTimescale: MOVIE_TIMESCALE }).bytes);
    const startSeconds = emptyMilliseconds / MOVIE_TIMESCALE;
    expect(read.video).toEqual([expectedPackets(video, { startSeconds })]);
  });
});
