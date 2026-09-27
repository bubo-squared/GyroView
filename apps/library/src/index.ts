/**
 * The npm package: the element, the player without the element, and the types their methods and
 * events speak. The core and the adapters are bundled in; nothing else of theirs is public.
 */
export {
  createBrowserPlayer,
  defineGyroView,
  GYRO_VIEW_TAG,
  GyroViewElement,
  inspectRecording,
  Player,
} from '@gyroview/player';
export type {
  BlobInput,
  BrowserPortsOptions,
  FileSource,
  GyroViewElementEventMap,
  ImuFrameSummary,
  InspectOptions,
  LoadOptions,
  MediaInput,
  PipelineHost,
  PlayerEvents,
  PlayerMetadata,
  PlayerSource,
  PlayerStatus,
  SoundLevel,
  UrlInput,
} from '@gyroview/player';
export {
  GyroViewError,
  hasErrorCode,
  STABILIZATION_MODES,
  VIEW_MODES,
  type BoxSummary,
  type CalibrationSummary,
  type DamagedExposure,
  type ExposureReport,
  type ExposureSummary,
  type GyroSummary,
  type GyroViewErrorCode,
  type LensSummary,
  type RecordingInfo,
  type RecordingInspection,
  type RecordSummary,
  type StabilizationMode,
  type ViewMode,
  type UnreadableGyro,
  type UnreadExposure,
  type ViewState,
} from '@gyroview/core';
