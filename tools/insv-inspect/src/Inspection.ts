import type { CalibrationVersion, RecordingInfo, TrailerWrapper } from '@gyroview/core';

/**
 * Plain data describing one inspected file, decoupled from the domain objects so the report
 * renderer and its tests need no I/O.
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
  readonly warnings: readonly string[];
}

export interface GyroSummary {
  readonly layout: string;
  readonly samples: number;
  readonly strayBytes: number;
  readonly spanSeconds: number;
  readonly meanIntervalUs: number | undefined;
  /**
   * Mean |acceleration| over the leading samples; about 1 g proves the range scaling.
   */
  readonly meanAccelerationMagnitudeG: number;
}

export interface ExposureSummary {
  readonly entries: number;
  readonly firstCaptureTimeUs: number;
  readonly lastCaptureTimeUs: number;
  readonly meanShutterTimeSeconds: number;
  /**
   * Index of the entry that belongs to the first encoded frame, when the info record says.
   */
  readonly firstEncodedFrameEntry: number | undefined;
}

export interface Inspection {
  readonly file: string;
  readonly fileSize: number;
  readonly boxes: readonly BoxSummary[];
  readonly trailerWrapper: TrailerWrapper;
  readonly trailerVersion: number;
  readonly payloadStart: number;
  readonly records: readonly RecordSummary[];
  readonly info: RecordingInfo;
  readonly calibration: CalibrationSummary;
  readonly gyro: GyroSummary | undefined;
  readonly exposure: ExposureSummary | undefined;
}
