// Application API
export { readRecording } from './application/recording/readRecording';
export { Recording, type RecordSummary } from './application/recording/Recording';

// Ports and the values they exchange
export type { RandomAccessSource } from './ports/RandomAccessSource';
export { ByteRange } from './shared/binary/ByteRange';

// Domain models
export type { BoxDescriptor, TrailerWrapper } from './domain/format/boxes/BoxLayout';
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
export type {
  FrameRegion,
  LensLayout,
  LensLayoutKind,
  LensSource,
} from './domain/format/layout/LensLayout';
export type {
  InputDescription,
  VideoTrackDescription,
} from './domain/format/layout/VideoTrackDescription';
export type { ParsedGyroRecord } from './domain/format/records/gyro/parseGyroRecord';
export { GyroTrack, type GyroSample } from './domain/motion/gyro/GyroTrack';
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
export type { LensModel, LensModelKind } from './domain/optics/LensModel';
export type { PixelPoint } from './domain/optics/PixelPoint';
export type { CalibrationChoice } from './domain/optics/selectCalibration';

// Shared vocabulary
export { GyroViewError, type GyroViewErrorCode } from './shared/errors/GyroViewError';
export { magnitudeOf, type Vector3 } from './shared/math/Vector3';
export type {
  ReadonlyFloat32Array,
  ReadonlyFloat64Array,
} from './shared/binary/ReadonlyTypedArray';
export * from './shared/units/time';
export * from './shared/units/angle';

// Playback ports and pipeline
export type {
  AudioTrackDescription,
  DemuxedInput,
  Demuxer,
  EncodedVideoPacket,
  VideoDecoderConfiguration,
  VideoTrackReader,
} from './ports/Demuxer';
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
export type { PlaybackClock } from './ports/PlaybackClock';
export type { FrameSink, Presentation } from './ports/FrameSink';
export { WallClock } from './domain/playback/WallClock';
export { PlayerStateMachine, type PlayerState } from './domain/playback/PlayerState';
export { TypedEmitter } from './shared/events/TypedEmitter';
export {
  PlaybackSession,
  type PlaybackSessionEvents,
  type PlaybackSessionParts,
} from './application/playback/PlaybackSession';
