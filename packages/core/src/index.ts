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
export { readSampleTable, type ReadSampleTable } from './application/recording/readSampleTable';

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
export { hevcCodecStringOf } from './domain/format/mp4/hevcCodecString';
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
  rotationIntoBody,
  UPRIGHT_MOUNTING,
  type MountedMotion,
  type Mounting,
} from './domain/motion/mounting/Mounting';
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
export {
  type CalibrationSet,
  type CanvasSize,
  type EulerDegrees,
  type LensCalibration,
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
export { motionLookRulesFor, viewModeRulesFor } from './domain/view/viewModes';
export { screenLookOf, type DeviceAttitude, type ScreenLook } from './domain/view/screenLook';
export {
  followReading,
  withoutRoll,
  type DeviceHold,
  type DeviceReading,
} from './domain/view/motionLookView';
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
export { MEI_TERM_CAPACITY, type MeiDistortion } from './domain/optics/MeiDistortion';
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
export {
  COLOUR_PRIMARIES,
  MATRIX_COEFFICIENTS,
  namedOrUnspecified,
  TRANSFER_CHARACTERISTICS,
  type ColourPrimaries,
  type ColourRange,
  type MatrixCoefficients,
  type TrackColour,
  type TransferCharacteristics,
} from './domain/colour/TrackColour';
export {
  BT709_LUMINANCE,
  displayConversionsOf,
  HLG_OETF,
  type DisplayConversion,
  type DisplayConversionChoice,
  type ToneCurve,
} from './domain/colour/DisplayConversion';
export { matrixCorrectionOf } from './domain/colour/matrixCorrection';

// Shared vocabulary
export * from './shared';

// Downloading a recording while it plays
export { SourceByteStream } from './application/download/SourceByteStream';
export { Ending, ITERATION_END } from './shared/async/iteration';
export {
  startFileDownload,
  type DownloadedAudioTrack,
  type DownloadedFile,
} from './application/download/startFileDownload';
export { downloadPolicyFor } from './domain/download/DownloadPolicy';
export { RecordingBuffer } from './application/download/RecordingBuffer';

// The container's sample tables
export { SampleTable } from './domain/container/SampleTable';
export { TrackSampleTable } from './domain/container/TrackSampleTable';

// Playback ports and pipeline
export type { VideoTrackReader } from './ports/VideoTrackReader';
export type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from './ports/VideoTrack';
export type { AudioSegmentSource } from './ports/AudioSegmentSource';
export type { ByteStream } from './ports/ByteStream';
export type { MediaBuffer } from './ports/MediaBuffer';
export type { AudioSampleSource } from './ports/AudioSampleSource';
export type { AudioPackager } from './ports/AudioPackager';
export type { AudioDecoderConfiguration, EncodedAudioSample } from './ports/AudioTrack';
export type {
  AudioTrackCodec,
  CodecReader,
  ContainerCodecs,
  VideoTrackCodec,
} from './ports/CodecReader';
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
