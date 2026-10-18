import path from 'node:path';

import { MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { readRecording, timeRecording, type RecordingTiming } from '@gyroview/core';
import { openDownloadedSource } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { localSampleEntries, recordingPathOf } from './localCatalogueFile';
import { SAMPLES_ROOT } from './samples';

/**
 * Reading a clip and its original takes a few seconds each from a local disk.
 */
const TIMEOUT_MS = 60_000;

/**
 * The local clips trimmed in the Insta360 app whose original this machine has too (ADR 0031).
 */
const TRIMMED = localSampleEntries().flatMap((entry) =>
  entry.trimmedFrom
    ? [
        {
          name: entry.name,
          clip: recordingPathOf(entry),
          original: path.join(SAMPLES_ROOT, entry.trimmedFrom.folder, entry.trimmedFrom.recording),
          startFrame: entry.trimmedFrom.startFrame,
        },
      ]
    : [],
);

async function timingOf(file: string): Promise<RecordingTiming> {
  const source = await FileRandomAccessSource.open(file);
  const input = await openDownloadedSource(source, new MediabunnyCodecReader());
  try {
    return await timeRecording(await readRecording(source), input.videoTracks[0]);
  } finally {
    input.dispose();
    await source.close();
  }
}

describe.skipIf(TRIMMED.length === 0)('the clips trimmed in the Insta360 app', () => {
  it.each(TRIMMED)(
    'times every frame of the $name as the frame of its original it was cut from',
    async ({ clip, original, startFrame }) => {
      const [clipTiming, originalTiming] = await Promise.all([timingOf(clip), timingOf(original)]);
      const clipFrames = clipTiming.frameTimes;
      const originalFrames = originalTiming.frameTimes;
      expect(clipTiming.frameTimeSource).toBe('exposure-record');
      expect(clipFrames && originalFrames).toBeDefined();
      if (!clipFrames || !originalFrames) return;
      const last = clipFrames.frameCount - 1;
      for (const index of [0, Math.floor(last / 2), last]) {
        expect(clipFrames.frameAt(index).captureTime).toBe(
          originalFrames.frameAt(index + startFrame).captureTime,
        );
      }
    },
    TIMEOUT_MS,
  );
});
