/**
 * Everything the player learns from the info record. Absent fields are `undefined`; nothing here
 * is assumed present except on cameras where a field has been observed.
 */
export interface LensDimension {
  readonly width: number;
  readonly height: number;
}

export interface FileGroup {
  readonly type: number | undefined;
  readonly index: number | undefined;
  readonly identify: string | undefined;
  readonly total: number | undefined;
}

export interface SensorRanges {
  readonly accelerometerG: number | undefined;
  readonly gyroscopeDps: number | undefined;
}

export interface WindowCrop {
  readonly sensorWidth: number | undefined;
  readonly sensorHeight: number | undefined;
  readonly cropWidth: number | undefined;
  readonly cropHeight: number | undefined;
  readonly cropOffsetX: number | undefined;
  readonly cropOffsetY: number | undefined;
}

export interface CalibrationStrings {
  readonly offset: string | undefined;
  readonly offsetV2: string | undefined;
  readonly offsetV3: string | undefined;
}

export interface RecordingInfo {
  readonly serialNumber: string | undefined;
  readonly model: string | undefined;
  readonly firmware: string | undefined;
  readonly calibration: CalibrationStrings;
  readonly dimension: LensDimension | undefined;
  readonly frameRate: number | undefined;
  readonly captureMode: string | undefined;
  readonly firstFrameTimestamp: number | undefined;
  readonly rollingShutterTimeMs: number | undefined;
  readonly fileGroup: FileGroup | undefined;
  readonly windowCrop: WindowCrop | undefined;
  readonly gyroTimestampMs: number | undefined;
  readonly totalFrames: number | undefined;
  readonly gyroType: number | undefined;
  readonly isRawGyro: boolean | undefined;
  readonly ptsType: number | undefined;
  readonly sensorRanges: SensorRanges | undefined;
  readonly fileLayout: number | undefined;
  readonly trackOrder: number | undefined;
}
