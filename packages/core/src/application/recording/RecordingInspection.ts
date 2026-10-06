import type { TrailerWrapper } from '../../domain/format/boxes/BoxLayout';
import type { CalibrationVersion } from '../../domain/format/calibration/CalibrationVersion';
import type { RecordingInfo } from '../../domain/format/info/RecordingInfo';

/**
 * One top-level box of the file: its four-character type, where it starts and how long it is.
 */
export interface BoxSummary {
  readonly type: string;
  readonly offset: number;
  readonly size: number;
}

export interface RecordSummary {
  readonly id: number;
  readonly format: number;
  readonly offset: number;
  readonly size: number;
}

export interface LensSummary {
  readonly lensIndex: number;
  readonly model: string;
  readonly principalPoint: readonly [x: number, y: number];
  readonly orientationDegrees: readonly [yaw: number, pitch: number, roll: number];
  readonly translationMetres: readonly [x: number, y: number, z: number];
}

export interface CalibrationSummary {
  readonly version: CalibrationVersion;
  readonly canvas: readonly [width: number, height: number];
  readonly lenses: readonly LensSummary[];
}

export interface GyroSummary {
  readonly layout: string;
  readonly samples: number;
  readonly strayBytes: number;
  /**
   * Samples left out because their bytes cannot be a reading; a wrong layout guess shows here.
   */
  readonly damagedSamples: number;
  /**
   * Slots the camera left all zero, as it leaves the first ones it never wrote; no damage.
   */
  readonly unwrittenSamples: number;
  /**
   * Stamps put back where their neighbours say they belong: glitched stamps. A wrong stamp unit
   * scales them all alike and shows in the mean interval and the span instead.
   */
  readonly mendedStamps: number;
  readonly spanSeconds: number;
  readonly meanIntervalUs: number | undefined;
  /**
   * Mean |acceleration| over the leading samples; about 1 g proves the range scaling. Undefined
   * for a record without samples.
   */
  readonly meanAccelerationMagnitudeG: number | undefined;
}

/**
 * A gyro record whose sample layout could not be told, and why.
 */
export interface UnreadableGyro {
  readonly unreadable: string;
}

/**
 * An exposure record the trailer lists that did not parse: an entry no clock could have stamped
 * or no shutter could take.
 */
export interface DamagedExposure {
  readonly damaged: true;
}

/**
 * An exposure record the trailer lists that was not read, and why.
 */
export interface UnreadExposure {
  readonly unread: string;
}

/**
 * The record's entries; the times and the mean are undefined for a record without any, so the
 * summary stays plain data that serializes as it reads.
 */
export interface ExposureSummary {
  readonly entries: number;
  readonly firstCaptureTimeUs: number | undefined;
  readonly lastCaptureTimeUs: number | undefined;
  readonly meanShutterTimeSeconds: number | undefined;
  /**
   * Index of the entry that belongs to the first encoded frame, when the info record says.
   */
  readonly firstEncodedFrameEntry: number | undefined;
}

export type ExposureReport = ExposureSummary | DamagedExposure | UnreadExposure;

/**
 * What a recording's file holds, as plain data: its boxes, the trailer and its records, the info
 * record, the calibration and summaries of the gyro and exposure records. Serializable, so a
 * report, a page or a test can take it without the domain objects.
 */
export interface RecordingInspection {
  readonly fileSize: number;
  readonly boxes: readonly BoxSummary[];
  readonly trailerWrapper: TrailerWrapper;
  readonly trailerVersion: number;
  readonly payloadStart: number;
  readonly records: readonly RecordSummary[];
  readonly info: RecordingInfo;
  /**
   * Undefined when the recording carries no usable calibration string.
   */
  readonly calibration: CalibrationSummary | undefined;
  /**
   * Why calibration strings were skipped, whether or not one was usable.
   */
  readonly calibrationWarnings: readonly string[];
  readonly gyro: GyroSummary | UnreadableGyro | undefined;
  readonly exposure: ExposureReport | undefined;
}
