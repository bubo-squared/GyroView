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

/**
 * Full-scale ranges of the IMU, which the raw gyro sample layout needs to scale its integers.
 */
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
  /**
   * Capture-clock time of the first encoded frame, in the unit the gyro record uses
   * (microseconds for the raw layout, milliseconds for the float layout). Convert through
   * `CaptureClock.fromInfo`, never by hand.
   */
  readonly firstFrameTimestamp: number | undefined;
  /**
   * Rolling-shutter readout duration of one frame, in milliseconds.
   */
  readonly readoutTimeMs: number | undefined;
  readonly fileGroup: FileGroup | undefined;
  readonly windowCrop: WindowCrop | undefined;
  /**
   * How much later than the frames the gyro samples are stamped, in milliseconds.
   */
  readonly gyroOffsetMs: number | undefined;
  readonly totalFrames: number | undefined;
  readonly gyroType: number | undefined;
  readonly isRawGyro: boolean | undefined;
  readonly ptsType: number | undefined;
  readonly sensorRanges: SensorRanges | undefined;
  readonly fileLayout: number | undefined;
  readonly trackOrder: number | undefined;
}
