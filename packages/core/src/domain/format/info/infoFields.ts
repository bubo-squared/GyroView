/**
 * Field numbers of the info record's protobuf message (record id 1, format 1).
 * Sources: Gyroflow telemetry-parser `src/insta360/extra_info.rs` (names) and the two X5
 * recordings (values confirmed on 2026-09-18). Fields marked "observed" have no published
 * name; their meaning was inferred from the sample values and must be treated as provisional.
 */
export const InfoField = {
  SerialNumber: 1,
  Model: 2,
  Firmware: 3,
  /**
  Legacy calibration string: lens count, then `r cx cy yaw pitch roll` per lens.
  */
  Offset: 5,
  /**
  Nested: 1 width, 2 height of one lens track.
  */
  Dimension: 19,
  FrameRate: 20,
  /**
  Observed: "standard" on X5.
  */
  CaptureMode: 22,
  /**
  Capture-clock timestamp of the first encoded frame; unit follows the gyro record.
  */
  FirstFrameTimestamp: 24,
  RollingShutterTimeMs: 25,
  /**
  Nested: 1 type, 2 index, 3 identify, 4 total. Shared by segments of one recording.
  */
  FileGroupInfo: 26,
  /**
  Nested: 1..6 sensor and crop dimensions. Observed 5376 5376 5312 5312 0 0 on X5.
  */
  WindowCropInfo: 27,
  GyroTimestampMs: 28,
  HasGyroTimestamp: 29,
  TotalFrames: 40,
  IsFlowstateOnline: 42,
  GyroType: 51,
  /**
  Polynomial calibration string (v2).
  */
  OffsetV2: 53,
  /**
  Unified (MEI) camera model calibration string (v3, or v6 with more coefficients).
  */
  OffsetV3: 54,
  IsRawGyro: 62,
  /**
  1 = frame times from MP4 PTS, 2 = from the exposure record (`PtsType`).
  */
  PtsType: 64,
  /**
  Nested: 1 accelerometer range in g, 2 gyroscope range in degrees per second.
  */
  GyroConfig: 65,
  /**
  Observed (insta360-rs): 1 = split into `_00_`/`_10_` files, 2 = tracks in one file.
  */
  FileLayout: 79,
  /**
  Observed (insta360-rs): 1 = track 0 is stream 10, 2 = track 0 is stream 00.
  */
  TrackOrder: 80,
} as const;

export const DimensionField = { Width: 1, Height: 2 } as const;
export const GyroConfigField = { AccelerometerRangeG: 1, GyroscopeRangeDps: 2 } as const;
export const WindowCropField = {
  SensorWidth: 1,
  SensorHeight: 2,
  CropWidth: 3,
  CropHeight: 4,
  CropOffsetX: 5,
  CropOffsetY: 6,
} as const;

/**
 * Values of the `pts_type` field: where the camera says frame times come from.
 */
export const PtsType = { TrackTimestamps: 1, ExposureRecord: 2 } as const;

/**
 * Values of the file-layout field, per insta360-rs. Provisional: observed as 2 on X5 multi-track
 * files, 1 is documented for `_00_`/`_10_` pairs.
 */
export const FileLayoutValue = { SplitFiles: 1, MultiTrack: 2 } as const;

/**
 * Values of the track-order field, per insta360-rs. Provisional: stream `00` is the back lens
 * (calibration lens 0), stream `10` the screen-side lens. The X5 files seen so far write 1, so
 * their first track is the screen-side lens.
 */
export const TrackOrderValue = { Stream10First: 1, Stream00First: 2 } as const;
