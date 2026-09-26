import { FileRandomAccessSource } from '@gyroview/adapter-node';
import {
  hasErrorCode,
  magnitudeOf,
  messageOf,
  microseconds,
  microsecondsToSeconds,
  inspectLayout,
  readRecording,
  type ExposureRecord,
  type ParsedGyroRecord,
  type Recording,
  type RecordingLayout,
} from '@gyroview/core';

import type {
  CalibrationSummary,
  ExposureSummary,
  GyroSummary,
  Inspection,
  UnreadableGyro,
} from './Inspection';

const GRAVITY_SAMPLE_COUNT = 1000;

/**
 * Reads a recording from disk and condenses it into an {@link Inspection}.
 */
export async function inspectFile(file: string): Promise<Inspection> {
  const source = await FileRandomAccessSource.open(file);
  try {
    const [layout, recording] = await Promise.all([inspectLayout(source), readRecording(source)]);
    const [gyro, exposure] = await Promise.all([
      gyroOf(recording),
      unlessGyroUnreadable(recording.readExposureRecord()),
    ]);
    return {
      ...summarizeStructure(file, layout),
      info: recording.info,
      calibration: summarizeCalibration(recording),
      calibrationWarnings: recording.calibration.warnings,
      gyro,
      exposure:
        exposure === undefined
          ? undefined
          : summarizeExposure(exposure, await firstEncodedFrameEntry(exposure, recording)),
    };
  } finally {
    await source.close();
  }
}

type StructureSummary = Pick<
  Inspection,
  'file' | 'fileSize' | 'boxes' | 'trailerWrapper' | 'trailerVersion' | 'payloadStart' | 'records'
>;

function summarizeStructure(file: string, layout: RecordingLayout): StructureSummary {
  return {
    file,
    fileSize: layout.fileSize,
    boxes: layout.boxes.map((box) => ({
      type: box.type,
      offset: box.range.offset,
      size: box.range.length,
    })),
    trailerWrapper: layout.trailerWrapper,
    trailerVersion: layout.trailerVersion,
    payloadStart: layout.trailerPayloadStart,
    records: layout.records.map((record) => ({
      id: record.id,
      format: record.format,
      offset: record.payload.offset,
      size: record.payload.length,
    })),
  };
}

function summarizeCalibration(recording: Recording): CalibrationSummary | undefined {
  const { calibration } = recording.calibration;
  return calibration === undefined
    ? undefined
    : {
        version: calibration.version,
        canvas: [calibration.canvas.width, calibration.canvas.height],
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

function summarizeExposure(
  exposure: ExposureRecord,
  firstEncodedFrame: number | undefined,
): ExposureSummary {
  let shutterSum = 0;
  for (let index = 0; index < exposure.length; index += 1) {
    shutterSum += exposure.entryAt(index).shutterTime;
  }
  const hasEntries = exposure.length > 0;
  return {
    entries: exposure.length,
    firstCaptureTimeUs: hasEntries ? exposure.entryAt(0).captureTime : NaN,
    lastCaptureTimeUs: hasEntries ? exposure.entryAt(exposure.length - 1).captureTime : NaN,
    meanShutterTimeSeconds: hasEntries ? shutterSum / exposure.length : NaN,
    firstEncodedFrameEntry: firstEncodedFrame,
  };
}

/**
 * The gyro summary, or why the record cannot be read: a camera the inspector has not seen is the
 * case it exists for, so an undecidable layout is reported, not fatal.
 */
async function gyroOf(recording: Recording): Promise<GyroSummary | UnreadableGyro | undefined> {
  try {
    const gyro = await recording.readGyroRecord();
    return gyro === undefined ? undefined : summarizeGyro(gyro);
  } catch (error) {
    if (!hasErrorCode(error, 'unsupported-gyro-record')) throw error;
    return { unreadable: messageOf(error) };
  }
}

/**
 * What `read` finds, or nothing where the gyro layout cannot be told: the exposure stamps and
 * the first frame's are in its unit, so they are as unreadable as the gyro record.
 */
async function unlessGyroUnreadable<Value>(read: Promise<Value>): Promise<Value | undefined> {
  try {
    return await read;
  } catch (error) {
    if (hasErrorCode(error, 'unsupported-gyro-record')) return undefined;
    throw error;
  }
}

/**
 * The exposure entry of the first encoded frame; unknown without a capture clock.
 */
async function firstEncodedFrameEntry(
  exposure: ExposureRecord,
  recording: Recording,
): Promise<number | undefined> {
  const clock = await unlessGyroUnreadable(recording.captureClock());
  return clock === undefined ? undefined : exposure.indexAtOrAfter(clock.firstFrameCaptureTime);
}
