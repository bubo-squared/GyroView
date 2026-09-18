import { FileRandomAccessSource } from '@gyroview/adapter-node';
import {
  RecordingReader,
  magnitudeOf,
  microseconds,
  type ExposureRecord,
  type GyroTrack,
  type Recording,
} from '@gyroview/core';

import type { CalibrationSummary, ExposureSummary, GyroSummary, Inspection } from './Inspection';

const GRAVITY_SAMPLE_COUNT = 1000;

/**
 * Reads a recording from disk and condenses it into an {@link Inspection}.
 */
export async function inspectFile(file: string): Promise<Inspection> {
  const source = await FileRandomAccessSource.open(file);
  try {
    const recording = await new RecordingReader().read(source);
    const [gyro, exposure] = await Promise.all([
      recording.readGyroTrack(),
      recording.readExposureRecord(),
    ]);
    return {
      file,
      fileSize: await source.size(),
      boxes: recording.boxes.boxes.map((box) => ({
        type: box.type,
        offset: box.range.offset,
        size: box.range.length,
      })),
      trailerWrapper: recording.trailerWrapper,
      trailerVersion: recording.trailer.footer.version,
      payloadStart: recording.trailer.payloadStart,
      records: summarizeRecords(recording),
      info: recording.info,
      calibration: summarizeCalibration(recording),
      gyro: gyro === undefined ? undefined : summarizeGyro(gyro),
      exposure: exposure === undefined ? undefined : summarizeExposure(exposure, recording),
    };
  } finally {
    await source.close();
  }
}

function summarizeRecords(recording: Recording): Inspection['records'] {
  return recording.trailer.recordIds
    .toSorted((left, right) => left - right)
    .flatMap((id) => {
      const location = recording.trailer.locationOf(id);
      return location
        ? [
            {
              id,
              format: location.format,
              offset: location.payload.offset,
              size: location.payload.length,
            },
          ]
        : [];
    });
}

function summarizeCalibration(recording: Recording): CalibrationSummary {
  const { calibration, warnings } = recording.calibration;
  return {
    version: calibration.version,
    canvas: [calibration.canvas.width, calibration.canvas.height],
    warnings,
    lenses: calibration.lenses.map((lens) => ({
      index: lens.index,
      model: lens.model.kind,
      principalPoint: [lens.model.principalPoint.x, lens.model.principalPoint.y],
      orientationDegrees: [lens.orientation.yaw, lens.orientation.pitch, lens.orientation.roll],
      translationMetres: lens.translation,
    })),
  };
}

function summarizeGyro(gyro: GyroTrack): GyroSummary {
  const leading = Math.min(GRAVITY_SAMPLE_COUNT, gyro.length);
  let magnitudeSum = 0;
  for (let index = 0; index < leading; index += 1) {
    magnitudeSum += magnitudeOf(gyro.sampleAt(index).acceleration);
  }
  return {
    samples: gyro.length,
    firstTimestampUs: gyro.length > 0 ? gyro.sampleAt(0).timestamp : NaN,
    lastTimestampUs: gyro.length > 0 ? gyro.sampleAt(gyro.length - 1).timestamp : NaN,
    meanIntervalUs: gyro.meanSampleInterval,
    meanAccelerationMagnitudeG: leading > 0 ? magnitudeSum / leading : NaN,
  };
}

function summarizeExposure(exposure: ExposureRecord, recording: Recording): ExposureSummary {
  const firstFrame = recording.info.firstFrameTimestamp;
  let exposureSum = 0;
  for (let index = 0; index < exposure.length; index += 1)
    exposureSum += exposure.entryAt(index).exposure;
  return {
    entries: exposure.length,
    firstTimestampUs: exposure.length > 0 ? exposure.entryAt(0).timestamp : NaN,
    lastTimestampUs: exposure.length > 0 ? exposure.entryAt(exposure.length - 1).timestamp : NaN,
    meanExposureSeconds: exposure.length > 0 ? exposureSum / exposure.length : NaN,
    firstEncodedFrameEntry:
      firstFrame === undefined ? undefined : exposure.indexAtOrAfter(microseconds(firstFrame)),
  };
}
