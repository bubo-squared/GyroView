import { existsSync } from 'node:fs';
import path from 'node:path';

import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { readSampleTable, seconds, type SampleTable, type TrackSampleTable } from '@gyroview/core';
import { ALL_FORMATS, EncodedPacketSink, FilePathSource, Input, type InputTrack } from 'mediabunny';
import { describe, expect, it } from 'vitest';

import {
  KRNJACA_RECORDING,
  OFFICE_RECORDING,
  SAILING_RECORDING,
  X3_BACK_RECORDING,
  X3_FRONT_RECORDING,
} from './samples';

/**
 * The core reads the recordings' sample tables itself; on every real recording at hand it must
 * agree with mediabunny, reading the file on its own, on every sample. The bytes are compared on
 * the first samples of each track: reading all of a 7 GB file twice would take minutes.
 */
const RECORDINGS = [
  OFFICE_RECORDING,
  SAILING_RECORDING,
  KRNJACA_RECORDING,
  X3_FRONT_RECORDING,
  X3_BACK_RECORDING,
].filter((recording) => existsSync(recording));
const SAMPLES_READ_WHOLE = 40;
const KEYFRAME_PROBES = [0, 0.5, 30.02, 59.99, 100, 1e6];
const TIMEOUT_MS = 120_000;

interface SampleMetadata {
  readonly timestamp: number;
  readonly duration: number;
  readonly isKey: boolean;
  readonly size: number;
}

async function withReadings(
  recording: string,
  check: (table: SampleTable, input: Input, source: FileRandomAccessSource) => Promise<void>,
): Promise<void> {
  const source = await FileRandomAccessSource.open(recording);
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(recording) });
  try {
    const { table } = await readSampleTable(source);
    await check(table, input, source);
  } finally {
    input.dispose();
    await source.close();
  }
}

async function tracksOf(input: Input): Promise<InputTrack[]> {
  const [video, audio] = await Promise.all([input.getVideoTracks(), input.getAudioTracks()]);
  return [...video, ...audio];
}

function ourTrack(table: SampleTable, track: InputTrack): TrackSampleTable {
  const ours = table.trackWithId(track.id);
  if (!ours) throw new Error(`the sample table has no track ${track.id}`);
  return ours;
}

async function theirMetadata(track: InputTrack): Promise<SampleMetadata[]> {
  const samples: SampleMetadata[] = [];
  const packets = new EncodedPacketSink(track).packets(undefined, undefined, {
    metadataOnly: true,
  });
  for await (const packet of packets) {
    samples.push({
      timestamp: packet.timestamp,
      duration: packet.duration,
      isKey: packet.type === 'key',
      size: packet.byteLength,
    });
  }
  return samples;
}

function ourMetadata(track: TrackSampleTable): SampleMetadata[] {
  return Array.from({ length: track.sampleCount }, (_, sample) => ({
    timestamp: track.timestampOf(sample),
    duration: track.durationOf(sample),
    isKey: track.isSync(sample),
    size: track.rangeOf(sample).length,
  }));
}

async function theirFirstBytes(track: InputTrack): Promise<number[][]> {
  const bytes: number[][] = [];
  const packets = new EncodedPacketSink(track).packets();
  for await (const packet of packets) {
    bytes.push([...packet.data]);
    if (bytes.length === SAMPLES_READ_WHOLE) break;
  }
  return bytes;
}

async function ourFirstBytes(
  track: TrackSampleTable,
  source: FileRandomAccessSource,
): Promise<number[][]> {
  const count = Math.min(SAMPLES_READ_WHOLE, track.sampleCount);
  const reads = Array.from({ length: count }, (_, sample) => source.read(track.rangeOf(sample)));
  const samples = await Promise.all(reads);
  return samples.map((bytes) => [...bytes]);
}

describe.skipIf(RECORDINGS.length === 0)(
  'the core sample table of the real recordings agrees with mediabunny',
  () => {
    it.each(RECORDINGS.map((recording) => [path.basename(recording), recording]))(
      'on every sample of every track of %s',
      async (_, recording) => {
        await withReadings(recording, async (table, input) => {
          const tracks = await tracksOf(input);
          expect(table.tracks).toHaveLength(tracks.length);
          for (const track of tracks) {
            expect(ourMetadata(ourTrack(table, track))).toEqual(await theirMetadata(track));
          }
          expect(table.duration).toBe(await input.computeDuration());
        });
      },
      TIMEOUT_MS,
    );

    it.each(RECORDINGS.map((recording) => [path.basename(recording), recording]))(
      'on the bytes of the first samples and on the keyframes times decode from, in %s',
      async (_, recording) => {
        await withReadings(recording, async (table, input, source) => {
          const tracks = await tracksOf(input);
          for (const track of tracks) {
            const ours = ourTrack(table, track);
            expect(await ourFirstBytes(ours, source)).toEqual(await theirFirstBytes(track));
          }
          const videoTracks = await input.getVideoTracks();
          for (const track of videoTracks) {
            const sink = new EncodedPacketSink(track);
            const ours = ourTrack(table, track);
            for (const time of KEYFRAME_PROBES) {
              const theirs = await sink.getKeyPacket(time, { metadataOnly: true });
              const sample = ours.keyframeAt(seconds(time));
              expect(sample === undefined ? undefined : ours.timestampOf(sample)).toBe(
                theirs?.timestamp,
              );
            }
          }
        });
      },
      TIMEOUT_MS,
    );
  },
);
