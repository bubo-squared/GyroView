import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { CalibrationVersion, readRecording } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { hasSamples, OFFICE_RECORDING as OFFICE, SAILING_RECORDING as SAILING } from './samples';

/**
 * The format domain end to end on the real recordings, which live outside the repository.
 * Skipped when the sample symlinks are absent (CI), run locally when they exist.
 */
const TIMEOUT_MS = 30_000;

describe.skipIf(!hasSamples())('reading the real X5 recordings', () => {
  it(
    'reads the office recording end to end',
    async () => {
      const source = await FileRandomAccessSource.open(OFFICE);
      try {
        const recording = await readRecording(source);
        expect(recording.trailerWrapper).toBe('inst-box');
        expect(recording.boxes.map((box) => box.type)).toEqual(['ftyp', 'mdat', 'moov', 'inst']);
        expect(recording.recordLocations()).toHaveLength(10);
        expect(recording.info).toMatchObject({ model: 'Insta360 X5', frameRate: 60 });
        expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Mei);

        const gyro = await recording.readGyroRecord();
        expect(gyro).toMatchObject({ layout: 'raw', strayBytes: 0 });
        expect(gyro?.track.length).toBe(261_872);
        expect(gyro?.track.sampleAt(0).captureTime).toBe(921_648_752);

        const exposure = await recording.readExposureRecord();
        expect(exposure?.length).toBe(15_720);
        const clock = await recording.captureClock();
        expect(clock).toBeDefined();
        if (clock) expect(exposure?.indexAtOrAfter(clock.firstFrameCaptureTime)).toBe(6);
      } finally {
        await source.close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'reads the sailing recording end to end',
    async () => {
      const source = await FileRandomAccessSource.open(SAILING);
      try {
        const recording = await readRecording(source);
        expect(recording.info).toMatchObject({ model: 'Insta360 X5', frameRate: 30 });
        expect(recording.info.dimension).toEqual({ width: 3840, height: 3840 });
        const exposure = await recording.readExposureRecord();
        expect(exposure?.length).toBeGreaterThan(5800);
      } finally {
        await source.close();
      }
    },
    TIMEOUT_MS,
  );
});
