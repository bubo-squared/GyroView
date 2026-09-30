import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { CalibrationVersion, inspectLayout, readRecording } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { localSampleEntries, recordingPathOf } from './localCatalogueFile';
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
        const layout = await inspectLayout(source);
        expect(layout.trailerWrapper).toBe('inst-box');
        expect(layout.boxes.map((box) => box.type)).toEqual(['ftyp', 'mdat', 'moov', 'inst']);
        expect(layout.records).toHaveLength(10);
        const recording = await readRecording(source);
        expect(recording.info).toMatchObject({ model: 'Insta360 X5', frameRate: 60 });
        expect(recording.calibration.calibration?.version).toBe(CalibrationVersion.Legacy);

        const gyro = await recording.readGyroRecord();
        // Real stamps have jitter and no glitches: nothing is left out or mended.
        expect(gyro).toMatchObject({
          layout: 'raw',
          strayBytes: 0,
          damagedSamples: 0,
          mendedStamps: 0,
        });
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
        const gyro = await recording.readGyroRecord();
        expect(gyro).toMatchObject({ damagedSamples: 0, mendedStamps: 0 });
      } finally {
        await source.close();
      }
    },
    TIMEOUT_MS,
  );
});

/**
 * The recordings only this machine has (ADR 0031): read end to end, whichever camera wrote them,
 * with what every playable recording needs and nothing a private file would reveal.
 */
const LOCAL_ENTRIES = localSampleEntries();

describe.skipIf(LOCAL_ENTRIES.length === 0)('reading the local recordings', () => {
  for (const entry of LOCAL_ENTRIES) {
    it(
      `reads ${entry.name} end to end, with a calibration, gyro samples and frame times`,
      async () => {
        const source = await FileRandomAccessSource.open(recordingPathOf(entry));
        try {
          const recording = await readRecording(source);
          expect(recording.calibration.calibration?.lenses).toHaveLength(2);
          expect(recording.calibration.warnings).toEqual([]);
          const gyro = await recording.readGyroRecord();
          expect(gyro).toMatchObject({ strayBytes: 0, damagedSamples: 0 });
          const exposure = await recording.readExposureRecord();
          expect(exposure?.length).toBeGreaterThan(0);
          expect(await recording.captureClock()).toBeDefined();
        } finally {
          await source.close();
        }
      },
      TIMEOUT_MS,
    );
  }
});
