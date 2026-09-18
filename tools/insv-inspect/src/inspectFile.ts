import { FileRandomAccessSource } from '@gyroview/adapter-node';
import {
  magnitudeOf,
  microseconds,
  microsecondsToSeconds,
  readRecording,
  type ExposureRecord,
  type ParsedGyroRecord,
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
    const recording = await readRecording(source);
    const [gyro, exposure] = await Promise.all([
      recording.readGyroRecord(),
      recording.readExposureRecord(),
    ]);
    return {
      file,
      fileSize: await source.size(),
      boxes: recording.boxes.map((box) => ({
        type: box.type,
        offset: box.range.offset,
        size: box.range.length,
      })),
      trailerWrapper: recording.trailerWrapper,
      trailerVersion: recording.trailerVersion,
      payloadStart: recording.trailerPayloadStart,
      records: recording.recordSummaries(),
      info: recording.info,
      calibration: summarizeCalibration(recording),
      gyro: gyro === undefined ? undefined : summarizeGyro(gyro),
      exposure: exposure === undefined ? undefined : summarizeExposure(exposure, recording),
    };
  } finally {
    await source.close();
  }
}

function summarizeCalibration(recording: Recording): CalibrationSummary {
  const { calibration, warnings } = recording.calibration;
  return {
    version: calibration.version,
    canvas: [calibration.canvas.width, calibration.canvas.height],
    warnings,
    lenses: calibration.lenses.map((lens) => ({
      lensIndex: lens.lensIndex,
      model: lens.model.kind,
      principalPoint: [lens.model.principalPoint.x, lens.model.principalPoint.y],
      orientationDegrees: [lens.orientation.yaw, lens.orientation.pitch, lens.orientation.roll],
      translationMetres: lens.translation,
    })),
  };
}

function summarizeGyro({ track, layout, strayBytes }: ParsedGyroRecord): GyroSummary {
  const leading = Math.min(GRAVITY_SAMPLE_COUNT, track.length);
  let magnitudeSum = 0;
  for (let index = 0; index < leading; index += 1)
    magnitudeSum += magnitudeOf(track.sampleAt(index).acceleration);
  const span = track.isEmpty
    ? 0
    : track.sampleAt(track.length - 1).captureTime - track.sampleAt(0).captureTime;
  return {
    layout,
    samples: track.length,
    strayBytes,
    spanSeconds: microsecondsToSeconds(microseconds(span)),
    meanIntervalUs: track.meanSampleInterval,
    meanAccelerationMagnitudeG: leading > 0 ? magnitudeSum / leading : NaN,
  };
}

function summarizeExposure(exposure: ExposureRecord, recording: Recording): ExposureSummary {
  let shutterSum = 0;
  for (let index = 0; index < exposure.length; index += 1)
    shutterSum += exposure.entryAt(index).shutterTime;
  const hasEntries = exposure.length > 0;
  return {
    entries: exposure.length,
    firstCaptureTimeUs: hasEntries ? exposure.entryAt(0).captureTime : NaN,
    lastCaptureTimeUs: hasEntries ? exposure.entryAt(exposure.length - 1).captureTime : NaN,
    meanShutterTimeSeconds: hasEntries ? shutterSum / exposure.length : NaN,
    firstEncodedFrameEntry: firstEncodedFrameEntry(exposure, recording),
  };
}

function firstEncodedFrameEntry(
  exposure: ExposureRecord,
  recording: Recording,
): number | undefined {
  return recording.info.firstFrameTimestamp === undefined
    ? undefined
    : exposure.indexAtOrAfter(recording.captureClock().firstFrameCaptureTime);
}
