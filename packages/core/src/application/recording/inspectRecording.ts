import { inspectLayout, type RecordingLayout } from './inspectLayout';
import { readRecording } from './readRecording';
import type { Recording } from './Recording';
import type {
  CalibrationSummary,
  ExposureReport,
  ExposureSummary,
  GyroSummary,
  RecordingInspection,
  UnreadableGyro,
} from './RecordingInspection';
import type { ParsedGyroRecord } from '../../domain/format/records/gyro/parseGyroRecord';
import type { ExposureRecord } from '../../domain/motion/exposure/ExposureRecord';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { hasErrorCode, messageOf } from '../../shared/errors/GyroViewError';
import { magnitudeOf } from '../../shared/math/Vector3';
import { microseconds, microsecondsToSeconds } from '../../shared/units/time';

const GRAVITY_SAMPLE_COUNT = 1000;

/**
 * Reads what a recording's file holds without playing it: the layout of its boxes and trailer,
 * the info record, the calibration and summaries of the gyro and exposure records. A gyro layout
 * it cannot tell is reported in the result, since telling it is what an inspection is for; a
 * file that is not a recording rejects as `readRecording` does.
 */
export async function inspectRecording(source: RandomAccessSource): Promise<RecordingInspection> {
  const [layout, recording] = await Promise.all([inspectLayout(source), readRecording(source)]);
  const gyro = await gyroOf(recording);
  const exposure = await exposureOf(recording, gyro);
  return {
    ...summarizeStructure(layout),
    info: recording.info,
    calibration: summarizeCalibration(recording),
    calibrationWarnings: recording.calibration.warnings,
    gyro,
    exposure,
  };
}

type StructureSummary = Pick<
  RecordingInspection,
  'fileSize' | 'boxes' | 'trailerWrapper' | 'trailerVersion' | 'payloadStart' | 'records'
>;

function summarizeStructure(layout: RecordingLayout): StructureSummary {
  return {
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

function summarizeGyro(gyro: ParsedGyroRecord): GyroSummary {
  const { track, layout, strayBytes, damagedSamples, mendedStamps } = gyro;
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
    damagedSamples,
    mendedStamps,
    spanSeconds: microsecondsToSeconds(microseconds(span)),
    meanIntervalUs: track.meanSampleInterval,
    meanAccelerationMagnitudeG: leading > 0 ? magnitudeSum / leading : undefined,
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
    firstCaptureTimeUs: hasEntries ? exposure.entryAt(0).captureTime : undefined,
    lastCaptureTimeUs: hasEntries ? exposure.entryAt(exposure.length - 1).captureTime : undefined,
    meanShutterTimeSeconds: hasEntries ? shutterSum / exposure.length : undefined,
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
 * The exposure summary; damaged when the trailer lists a record that did not parse, and not read
 * where the gyro layout cannot be told (its stamps are in the gyro's unit).
 */
async function exposureOf(
  recording: Recording,
  gyro: GyroSummary | UnreadableGyro | undefined,
): Promise<ExposureReport | undefined> {
  if (!recording.listsExposureRecord) return undefined;
  if (gyro !== undefined && 'unreadable' in gyro) return { unread: 'gyro layout unknown' };
  const exposure = await recording.readExposureRecord();
  return exposure
    ? summarizeExposure(exposure, await firstEncodedFrameEntry(exposure, recording))
    : { damaged: true };
}

/**
 * The exposure entry of the first encoded frame; unknown without a capture clock.
 */
async function firstEncodedFrameEntry(
  exposure: ExposureRecord,
  recording: Recording,
): Promise<number | undefined> {
  const clock = await recording.captureClock();
  return clock === undefined ? undefined : exposure.indexAtOrAfter(clock.firstFrameCaptureTime);
}
