import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RecordingReader } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { FileRandomAccessSource } from './FileRandomAccessSource';

/**
 * End-to-end checks against the real recordings, which live outside the repository. Skipped when
 * the sample symlinks are absent (CI), run locally when they exist.
 */
const SAMPLES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../samples',
);
const OFFICE = path.join(SAMPLES_ROOT, 'office/VID_20260814_132640_00_013.insv');
const SAILING = path.join(SAMPLES_ROOT, 'sailing/VID_20260918_082915_00_014.insv');

describe.skipIf(!existsSync(OFFICE) || !existsSync(SAILING))('real X5 recordings', () => {
  it('reads the office recording end to end', async () => {
    const source = await FileRandomAccessSource.open(OFFICE);
    try {
      const recording = await new RecordingReader().read(source);
      expect(recording.trailerWrapper).toBe('inst-box');
      expect(recording.boxes.boxes.map((box) => box.type)).toEqual([
        'ftyp',
        'mdat',
        'moov',
        'inst',
      ]);
      expect(recording.trailer.recordIds).toHaveLength(10);
      expect(recording.info).toMatchObject({ model: 'Insta360 X5', frameRate: 60 });
      expect(recording.calibration.calibration.version).toBe(3);

      const gyro = await recording.readGyroTrack();
      expect(gyro?.length).toBe(261_872);
      expect(gyro?.sampleAt(0).timestamp).toBe(921_648_752);

      const exposure = await recording.readExposureRecord();
      expect(exposure?.length).toBe(15_720);
      expect(exposure?.indexAtOrAfter(recording.info.firstFrameTimestamp as never)).toBe(6);
    } finally {
      await source.close();
    }
  }, 30_000);

  it('reads the sailing recording end to end', async () => {
    const source = await FileRandomAccessSource.open(SAILING);
    try {
      const recording = await new RecordingReader().read(source);
      expect(recording.info).toMatchObject({ model: 'Insta360 X5', frameRate: 30 });
      expect(recording.info.dimension).toEqual({ width: 3840, height: 3840 });
      const exposure = await recording.readExposureRecord();
      expect(exposure?.length).toBeGreaterThan(5800);
    } finally {
      await source.close();
    }
  }, 30_000);
});
