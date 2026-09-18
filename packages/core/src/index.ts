export type { RandomAccessSource } from './ports/RandomAccessSource';
export { ByteRange } from './shared/binary/ByteRange';
export { ByteReader } from './shared/binary/ByteReader';
export { GyroViewError, type GyroViewErrorCode } from './shared/errors/GyroViewError';
export { RecordType, InfoRecordFormat } from './domain/format/constants';
export { Trailer } from './domain/format/trailer/Trailer';
export { TrailerFooter } from './domain/format/trailer/TrailerFooter';
export { TrailerReader } from './domain/format/trailer/TrailerReader';
export type { RecordLocation } from './domain/format/trailer/RecordLocation';
export { InfoRecordParser } from './domain/format/info/InfoRecordParser';
export type {
  RecordingInfo,
  CalibrationStrings,
  LensDimension,
  SensorRanges,
} from './domain/format/info/RecordingInfo';
export { ProtobufMessage } from './shared/protobuf/ProtobufMessage';
export { GyroRecordParser, type GyroRecordHints } from './domain/motion/gyro/GyroRecordParser';
export { GyroTrack, type GyroSample } from './domain/motion/gyro/GyroTrack';
export { ExposureRecordParser } from './domain/motion/exposure/ExposureRecordParser';
export { ExposureRecord, type ExposureEntry } from './domain/motion/exposure/ExposureRecord';
export type { Vector3 } from './shared/math/Vector3';
export * from './shared/units/time';
export * from './shared/units/angle';
export { CalibrationSelector, type CalibrationChoice } from './domain/optics/CalibrationSelector';
export { OffsetStringParser } from './domain/optics/OffsetStringParser';
export { MeiModel, type MeiParameters } from './domain/optics/MeiModel';
export { PolynomialModel, type PolynomialParameters } from './domain/optics/PolynomialModel';
export { EquidistantModel, type EquidistantParameters } from './domain/optics/EquidistantModel';
export type { LensModel, LensModelKind } from './domain/optics/LensModel';
export type { PixelPoint } from './domain/optics/PixelPoint';
export {
  CalibrationVersion,
  type CalibrationSet,
  type CanvasSize,
  type EulerDegrees,
  type LensCalibration,
} from './domain/optics/LensCalibration';
export { BoxScanner } from './domain/format/boxes/BoxScanner';
export { BoxType } from './domain/format/boxes/boxConstants';
export { findBox, type BoxDescriptor, type BoxLayout } from './domain/format/boxes/BoxLayout';
