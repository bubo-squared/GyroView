// Application API
export { readRecording } from './application/recording/readRecording';
export { inspectLayout, type RecordingLayout } from './application/recording/inspectLayout';
export { inspectRecording } from './application/recording/inspectRecording';
export type {
  BoxSummary,
  CalibrationSummary,
  DamagedExposure,
  ExposureReport,
  ExposureSummary,
  GyroSummary,
  LensSummary,
  RecordingInspection,
  RecordSummary,
  UnreadableGyro,
  UnreadExposure,
} from './application/recording/RecordingInspection';
export type { Recording } from './application/recording/Recording';
export { timeRecording, type RecordingTiming } from './application/recording/timeRecording';
export type { MotionSetup } from './application/recording/motionOf';
export { locateOtherLensFile } from './application/recording/locateOtherLensFile';

// Ports and the values they exchange
export type { RandomAccessSource } from './ports/RandomAccessSource';
export type { ResourceLocator } from './ports/ResourceLocator';
export { ByteRange } from './shared/binary/ByteRange';

// Domain models
export type { BoxDescriptor, TrailerWrapper } from './domain/format/boxes/BoxLayout';
export { RecordingFileName } from './domain/format/naming/RecordingFileName';
export type {
  CalibrationStrings,
  FileLayoutHint,
  LensDimension,
  RecordingInfo,
  SensorRanges,
  TrackOrderHint,
  WindowCrop,
} from './domain/format/info/RecordingInfo';
export { detectLensLayout, type LayoutHints } from './domain/format/layout/detectLensLayout';
export {
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type FrameRegion,
  type LensLayout,
  type LensLayoutKind,
  type LensSource,
} from './domain/stitching/LensLayout';
export type { ParsedGyroRecord } from './domain/format/records/gyro/parseGyroRecord';
export type { GyroSample, GyroTrack } from './domain/motion/gyro/GyroTrack';
export {
  isProperRotation,
  assumedImuFrame,
  imuFrameFor,
  toBodyFrame,
  type BodyAxes,
  type ImuFrame,
  type ImuFrameHints,
  type SignedAxis,
} from './domain/motion/imu/ImuFrame';
export {
  OrientationTrack,
  type IntegrationOptions,
  type OrientationTrackParts,
} from './domain/motion/orientation/OrientationTrack';
export {
  DEFAULT_STABILIZATION_MODE,
  STABILIZATION_MODES,
  type StabilizationMode,
  type Stabilizer,
} from './domain/motion/stabilization/Stabilizer';
export { stabilizerFor } from './domain/motion/stabilization/stabilizers';
export { ExposureRecord, type ExposureEntry } from './domain/motion/exposure/ExposureRecord';
export { CaptureClock } from './domain/motion/timing/CaptureClock';
export { FrameTimes } from './domain/motion/timing/FrameTimes';
export type { FrameTimeSourceName } from './domain/motion/timing/FrameTimeSource';
export {
  CalibrationVersion,
  type VersionedCalibration,
} from './domain/format/calibration/CalibrationVersion';
export type {
  CalibrationSet,
  CanvasSize,
  EulerDegrees,
  LensCalibration,
} from './domain/optics/LensCalibration';
export type { LensModel, LensModelKind, LensProjectionParameters } from './domain/optics/LensModel';
export { lensRotation, mirroredRoll } from './domain/optics/lensPose';
export { DEFAULT_MAX_GAIN, gainsMatching } from './domain/optics/gainMatch';
export { clampView, DEFAULT_VIEW, isSameView, type ViewState } from './domain/view/ViewState';
export {
  DEFAULT_PICTURE_QUALITY,
  PICTURE_QUALITIES,
  pixelRatioCapOf,
  type PictureQuality,
} from './domain/view/PictureQuality';
export {
  DEFAULT_VIEW_MODE,
  VIEW_MODES,
  type ViewContext,
  type ViewMode,
  type ViewModeRules,
} from './domain/view/ViewMode';
export { viewModeRulesFor } from './domain/view/viewModes';
export { DEFAULT_FRAMING, isSameFraming, type Framing } from './domain/view/Framing';
export { aspectOfArea, planeHalfExtentOf } from './domain/view/rectilinear';
export { MAX_MAGNIFICATION, type Magnification } from './domain/view/magnification';
export type {
  EquirectangularPicture,
  LensTilesPicture,
  Picture,
  PictureKind,
  RectilinearPicture,
} from './domain/view/Picture';
export {
  aspectOf,
  SCREEN_CENTRE,
  type DragDelta,
  type ScreenPoint,
  type ScreenRectangle,
  type ViewportSize,
} from './domain/view/screenLayout';
export {
  lookAt,
  zoomStepsForPinch,
  type TurnRequest,
  type ZoomRequest,
} from './domain/view/viewGestures';
export {
  buildStitchingSetup,
  lensFrameOrder,
  type CanvasWindow,
  type FeatherBand,
  type FrameSourceKey,
  type LensStitch,
  type StitchingInputs,
  type StitchingSetup,
} from './domain/stitching/StitchingSetup';
export {
  StabilizingFrameSink,
  type StabilizingParts,
} from './application/stabilization/StabilizingFrameSink';
export type { PixelPoint } from './domain/optics/PixelPoint';
export { EquidistantModel, type EquidistantParameters } from './domain/optics/EquidistantModel';
export {
  GainMatchingFrameSink,
  type GainRenderer,
} from './application/gainMatching/GainMatchingFrameSink';
export type { SeamMeter } from './ports/SeamMeter';
export type { SeamMismatchMeter, SeamMismatchRequest } from './ports/SeamMismatchMeter';
export {
  isWithinArc,
  NADIR_ARC,
  SEAM_BIN_COLUMNS,
  SEAM_BIN_COUNT,
  SEAM_BIN_WIDTH,
  SEAM_CELL_SUBSAMPLES,
  SEAM_STRIP_ROWS,
  SEAM_STRIP_STEP,
  SEAM_STRIP_THETA_START,
  seamBinAzimuth,
  type AzimuthArc,
} from './domain/stitching/seamStrip';
export { SEAM_RING_ANGLE } from './domain/stitching/seamRing';
export { MISMATCH_CAP, type SeamBinCost, type SeamBinCosts } from './domain/stitching/seamMismatch';
export { binDisparitiesOf, slidesOf, type BinDisparity } from './domain/stitching/seamDisparity';
export { disparityFieldOf, easedDisparities } from './domain/stitching/seamDisparityField';
export {
  FIXED_SEAM_ALIGNMENT,
  SEAM_BEND_WIDTH,
  SEAM_CUT_DISPARITY,
  SEAM_CUT_HALF_WIDTH,
  SEAM_MAX_BEND,
  type SeamAlignment,
  type SeamJoin,
} from './domain/stitching/seamJoin';
export type { CalibrationChoice } from './domain/format/calibration/selectCalibration';

// Shared vocabulary
export {
  asGyroViewError,
  ensureIndexInRange,
  ensureInvariant,
  GYRO_VIEW_ERROR_CODES,
  GyroViewError,
  hasErrorCode,
  isAbortError,
  isGyroViewErrorCode,
  messageOf,
  type GyroViewErrorCode,
} from './shared/errors/GyroViewError';
export { keysOf } from './shared/keysOf';
export { lazy } from './shared/lazy';
export { Outbox, type EventSink } from './shared/events/Outbox';
export { clamp } from './shared/math/clamp';
export { indexOfLeast, parabolicOffset } from './shared/math/minimum';
export { magnitudeOf, type Vector3 } from './shared/math/Vector3';
export {
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from './shared/math/Matrix3';
export {
  conjugateQuaternion,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from './shared/math/Quaternion';
export type { ReadonlyFloat64Array } from './shared/binary/ReadonlyTypedArray';
export {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  seconds,
  secondsToMicroseconds,
  secondsToMilliseconds,
  type Microseconds,
  type Milliseconds,
  type Seconds,
} from './shared/units/time';
export {
  degrees,
  degreesToRadians,
  FULL_TURN,
  HALF_TURN,
  QUARTER_TURN,
  radians,
  radiansToDegrees,
  type Degrees,
  type Radians,
} from './shared/units/angle';

// Playback ports and pipeline
export type { AudioTrackReader, DemuxedInput, Demuxer, VideoTrackReader } from './ports/Demuxer';
export type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from './ports/VideoTrack';
export type { AudioSegmentSource } from './ports/AudioSegmentSource';
export type {
  DecodedFrame,
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from './ports/VideoDecoderPort';
export type { FramePair } from './ports/FramePair';
export { FramePairQueue } from './application/playback/FramePairQueue';
export {
  DecodePipeline,
  type DecodePipelineOptions,
  type DecodePipelineReport,
} from './application/playback/DecodePipeline';
export {
  probeDecoding,
  type DecodeProbeReport,
  type SourceProbeResult,
  type ProbeVerdict,
} from './application/playback/probeDecoding';
export { Deferred } from './shared/async/Deferred';
export { RunStop, STOPPED } from './shared/async/RunStop';
export { fileNameOfUrl } from './shared/text/urlPath';
export type { PlaybackClock } from './ports/PlaybackClock';
export type { FrameSink, Presentation } from './ports/FrameSink';
export type { PictureRenderer } from './ports/PictureRenderer';
export { WallClock } from './application/playback/WallClock';
export { isFlowing, type PlayerState } from './domain/playback/PlayerState';
export { TypedEmitter } from './shared/events/TypedEmitter';
export {
  PlaybackSession,
  type PlaybackSessionEvents,
  type PlaybackSessionParts,
} from './application/playback/PlaybackSession';
