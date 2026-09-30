import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AudioSampleSource, DownloadedFile, VideoTrackReader } from '@gyroview/core';
import {
  describeAudioSampleSourceContract,
  describeVideoTrackReaderContract,
  openDownloadedFile,
} from '@gyroview/core/testing';

import { MediabunnyCodecReader } from './MediabunnyCodecReader';

/**
 * The fixtures read as the player reads a recording: the core's sample table, mediabunny's
 * codecs from the movie bytes, and the download. The track readers answer to their contracts
 * as mediabunny's own did over the same files.
 */

const SYNTHETIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic',
);

async function openFixture(name: string): Promise<DownloadedFile> {
  const bytes = new Uint8Array(readFileSync(path.join(SYNTHETIC, name)));
  return openDownloadedFile(bytes, new MediabunnyCodecReader());
}

async function firstLensOf(name: string): Promise<VideoTrackReader> {
  const file = await openFixture(name);
  const [track] = file.videoTracks;
  if (!track) throw new Error('the fixture has no video track');
  return track;
}

async function soundOf(name: string): Promise<AudioSampleSource> {
  const file = await openFixture(name);
  const [track] = file.audioTracks;
  if (!track) throw new Error('the fixture has no sound');
  return track.samples;
}

describeVideoTrackReaderContract(
  'downloaded dual-track fixture',
  () => firstLensOf('dual-track-64px-10fps-3s.mp4'),
  { frameCount: 30, frameRate: 10, framesPerGop: 10 },
);

describeVideoTrackReaderContract(
  'downloaded late-start fixture',
  () => firstLensOf('late-start-64px-10fps-3s.mp4'),
  { frameCount: 30, frameRate: 10, framesPerGop: 10, firstTimestamp: 0.7 },
);

/**
 * The encoder's priming sample starts before zero and the edit list cuts the track at 3 s, its
 * last sample shorter than the rest.
 */
describeAudioSampleSourceContract(
  'downloaded AAC fixture',
  () => soundOf('dual-track-aac-moov-at-end-64px-10fps-3s.mp4'),
  { sampleCount: 142, sampleDuration: 1024 / 48_000, firstTimestamp: -1024 / 48_000, duration: 3 },
);
