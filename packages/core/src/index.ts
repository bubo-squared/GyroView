// Application API
export { readRecording } from './application/recording/readRecording';
export { Recording, type RecordSummary } from './application/recording/Recording';
export { locateOtherLensFile, locateProxy } from './application/recording/locateCompanions';

// Ports and the values they exchange
export type { RandomAccessSource } from './ports/RandomAccessSource';
export type { ResourceLocator } from './ports/ResourceLocator';
export { ByteRange } from './shared/binary/ByteRange';

// Domain models
export { RecordType } from './domain/format/constants';
export type { BoxDescriptor, TrailerWrapper } from './domain/format/boxes/BoxLayout';
export { RecordingFileName } from './domain/format/naming/RecordingFileName';
export type {
  CalibrationStrings,
  FileGroup,
  LensDimension,
  RecordingInfo,
  SensorRanges,
  WindowCrop,
} from './domain/format/info/RecordingInfo';
export {
  detectLensLayout,
  FileLayoutHint,
  type LayoutHints,
} from './domain/format/layout/detectLensLayout';
export {
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type FrameRegion,
  type LensLayout,
  type LensLayoutKind,
  type LensSource,
} from './domain/format/layout/LensLayout';
export type {
  InputDescription,
  VideoTrackDescription,
} from './domain/format/layout/VideoTrackDescription';
export type { ParsedGyroRecord } from './domain/format/records/gyro/parseGyroRecord';
export { GyroTrack, type GyroSample } from './domain/motion/gyro/GyroTrack';
export {
  ALIGNED_IMU_FRAME,
  isProperRotation,
  imuFrame,
  imuFrameFor,
  toBodyFrame,
  X5_IMU_FRAME,
  type BodyAxes,
  type ImuFrame,
  type ImuFrameHints,
  type SignedAxis,
} from './domain/motion/imu/ImuFrame';
export {
  DEFAULT_INTEGRATION_OPTIONS,
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
export {
  FollowStabilization,
  HorizonStabilization,
  LockStabilization,
  OffStabilization,
  stabilizerFor,
  type FollowOptions,
} from './domain/motion/stabilization/stabilizers';
export { ExposureRecord, type ExposureEntry } from './domain/motion/exposure/ExposureRecord';
export { CaptureClock, type CaptureClockUnit } from './domain/motion/timing/CaptureClock';
export { FrameTimes, type FrameTime } from './domain/motion/timing/FrameTimes';
export type {
  FrameTimeSourceName,
  FrameTimingContext,
} from './domain/motion/timing/FrameTimeSource';
export {
  PtsType,
  resolveFrameTimes,
  type ResolvedFrameTimes,
} from './domain/motion/timing/resolveFrameTimes';
export {
  CalibrationVersion,
  type CalibrationSet,
  type CanvasSize,
  type EulerDegrees,
  type LensCalibration,
} from './domain/optics/LensCalibration';
export type { LensModel, LensModelKind, LensProjectionParameters } from './domain/optics/LensModel';
export { lensRotation } from './domain/optics/lensPose';
export {
  clampView,
  DEFAULT_VIEW,
  FIELD_OF_VIEW_BOUNDS,
  isSameView,
  viewRotation,
  type FieldOfViewBounds,
  type ViewState,
} from './domain/view/ViewState';
export {
  DEFAULT_VIEW_MODE,
  VIEW_MODES,
  viewModeRulesFor,
  type ViewMode,
  type ViewModeRules,
} from './domain/view/ViewMode';
export type {
  EquirectangularPicture,
  LensTilesPicture,
  Picture,
  PictureKind,
  RectilinearPicture,
} from './domain/view/Picture';
export {
  fittedRectangle,
  lensTiles,
  WHOLE_SCREEN,
  type ScreenRectangle,
} from './domain/view/screenLayout';
export { lookAt, type DragDelta } from './domain/view/viewGestures';
export {
  EQUIRECTANGULAR_ASPECT,
  equirectangularDirectionOf,
  equirectangularPixelOf,
  type EquirectangularPixel,
  type PixelSize,
} from './domain/view/equirectangular';
export {
  buildStitchingSetup,
  DEFAULT_FEATHER,
  lensFrameOrder,
  type CanvasWindow,
  type FeatherBand,
  type FrameSourceKey,
  type LensStitch,
  type StitchingInputs,
  type StitchingSetup,
} from './application/stitching/StitchingSetup';
export {
  StabilizingFrameSink,
  type StabilizingParts,
} from './application/stitching/StabilizingFrameSink';
export type { PixelPoint } from './domain/optics/PixelPoint';
export { EquidistantModel, type EquidistantParameters } from './domain/optics/EquidistantModel';
export { MeiModel, type MeiParameters } from './domain/optics/MeiModel';
export { PolynomialModel, type PolynomialParameters } from './domain/optics/PolynomialModel';
export { DEFAULT_HALF_FIELD_OF_VIEW } from './domain/optics/opticsConstants';
export {
  DEFAULT_GAIN_MATCH_OPTIONS,
  GainMatcher,
  gainsMatching,
  type GainMatchOptions,
} from './domain/optics/gainMatch';
export type { CalibrationChoice } from './domain/optics/selectCalibration';
export { parseOffsetString } from './domain/optics/parseOffsetString';

// Shared vocabulary
export {
  ensureInvariant,
  GyroViewError,
  type GyroViewErrorCode,
} from './shared/errors/GyroViewError';
export {
  crossProduct,
  dotProduct,
  isFiniteVector,
  magnitudeOf,
  type Vector3,
} from './shared/math/Vector3';
export {
  determinantOf,
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
  IDENTITY_QUATERNION,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromRotationVector,
  quaternionToMatrix,
  rotateVector,
  slerpQuaternions,
  type Quaternion,
} from './shared/math/Quaternion';
export type {
  ReadonlyFloat32Array,
  ReadonlyFloat64Array,
} from './shared/binary/ReadonlyTypedArray';
export * from './shared/units/time';
export * from './shared/units/angle';

// Playback ports and pipeline
export type {
  AudioDecoderConfiguration,
  AudioTrackDescription,
  AudioTrackReader,
  DemuxedInput,
  Demuxer,
  EncodedAudioPacket,
  EncodedVideoPacket,
  VideoDecoderConfiguration,
  VideoTrackReader,
} from './ports/Demuxer';
export type { AudioSegmentSource } from './ports/AudioSegmentSource';
export type {
  DecodedFrame,
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from './ports/VideoDecoderPort';
export { closeFramePair, type FramePair } from './application/playback/FramePair';
export { FramePairQueue } from './application/playback/FramePairQueue';
export {
  LensDecodePipeline,
  type DecodePipelineOptions,
  type DecodeRunReport,
} from './application/playback/LensDecodePipeline';
export {
  probeDecoding,
  type DecodeProbeOptions,
  type DecodeProbeReport,
  type LensProbeResult,
  type LensProbeVerdict,
} from './application/playback/probeDecoding';
export { Deferred } from './shared/async/Deferred';
export { Signal } from './shared/async/Signal';
export type { PlaybackClock } from './ports/PlaybackClock';
export type { FrameSink, Presentation, StabilizableFrameSink } from './ports/FrameSink';
export { WallClock } from './domain/playback/WallClock';
export { PlayerStateMachine, type PlayerState } from './domain/playback/PlayerState';
export { TypedEmitter } from './shared/events/TypedEmitter';
export {
  PlaybackSession,
  type PlaybackSessionEvents,
  type PlaybackSessionParts,
} from './application/playback/PlaybackSession';
