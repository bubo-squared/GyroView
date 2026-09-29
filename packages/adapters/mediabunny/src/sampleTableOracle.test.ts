import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSampleTable, seconds, type SampleTable, type TrackSampleTable } from '@gyroview/core';
import { InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input, type InputTrack } from 'mediabunny';
import { describe, expect, it } from 'vitest';

/**
 * The core reads the recordings' sample tables itself; mediabunny is the reference it must agree
 * with, sample by sample and to the bit, on every fixture.
 */

const SYNTHETIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic',
);
const FIXTURES = [
  'dual-track-64px-10fps-3s.mp4',
  'dual-track-aac-64px-10fps-3s.mp4',
  'dual-track-aac-moov-at-end-64px-10fps-3s.mp4',
  'hevc-b-frames-dual-track-64px-10fps-3s.mp4',
  'late-start-64px-10fps-3s.mp4',
  'x5-trailer-dual-track-aac-64px-10fps-3s.mp4',
];
const KEYFRAME_PROBES = [0, 0.05, 0.95, 1, 1.5, 2.99, 5];

interface Reading {
  readonly table: SampleTable;
  readonly input: Input;
  readonly bytes: Uint8Array;
}

async function readingOf(name: string): Promise<Reading> {
  const bytes = new Uint8Array(readFileSync(path.join(SYNTHETIC, name)));
  const { table } = await readSampleTable(new InMemoryRandomAccessSource(bytes));
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  return { table, input, bytes };
}

async function mediabunnyTracksOf(input: Input): Promise<InputTrack[]> {
  const [video, audio] = await Promise.all([input.getVideoTracks(), input.getAudioTracks()]);
  return [...video, ...audio];
}

interface SampleReading {
  readonly timestamp: number;
  readonly duration: number;
  readonly isKey: boolean;
  readonly data: number[];
}

async function mediabunnySamplesOf(track: InputTrack): Promise<SampleReading[]> {
  const samples: SampleReading[] = [];
  const packets = new EncodedPacketSink(track).packets();
  for await (const packet of packets) {
    samples.push({
      timestamp: packet.timestamp,
      duration: packet.duration,
      isKey: packet.type === 'key',
      data: [...packet.data],
    });
  }
  return samples;
}

function ourSamplesOf(track: TrackSampleTable, bytes: Uint8Array): SampleReading[] {
  return Array.from({ length: track.sampleCount }, (_, sample) => {
    const range = track.rangeOf(sample);
    return {
      timestamp: track.timestampOf(sample),
      duration: track.durationOf(sample),
      isKey: track.isSync(sample),
      data: [...bytes.subarray(range.offset, range.end)],
    };
  });
}

function ascending(left: number, right: number): number {
  return left - right;
}

function ourTrack(table: SampleTable, track: InputTrack): TrackSampleTable {
  const ours = table.trackWithId(track.id);
  if (!ours) throw new Error(`the sample table has no track ${track.id}`);
  return ours;
}

describe('the core sample table agrees with mediabunny', () => {
  it.each(FIXTURES)('on every sample of every track of %s', async (name) => {
    const { table, input, bytes } = await readingOf(name);
    try {
      const tracks = await mediabunnyTracksOf(input);
      expect(table.tracks.map((track) => track.trackId).toSorted(ascending)).toEqual(
        tracks.map((track) => track.id).toSorted(ascending),
      );
      for (const track of tracks) {
        expect(ourSamplesOf(ourTrack(table, track), bytes)).toEqual(
          await mediabunnySamplesOf(track),
        );
      }
    } finally {
      input.dispose();
    }
  });

  it.each(FIXTURES)('on the duration of %s', async (name) => {
    const { table, input } = await readingOf(name);
    try {
      expect(table.duration).toBe(await input.computeDuration());
    } finally {
      input.dispose();
    }
  });

  it.each(FIXTURES)('on the keyframe a time of %s decodes from', async (name) => {
    const { table, input } = await readingOf(name);
    try {
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
    } finally {
      input.dispose();
    }
  });
});
