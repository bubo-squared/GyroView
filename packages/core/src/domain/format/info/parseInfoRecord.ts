import {
  DimensionField,
  FileGroupField,
  GyroConfigField,
  InfoField,
  PtsType,
  WindowCropField,
} from './infoFields';
import type {
  CalibrationStrings,
  FileGroup,
  LensDimension,
  RecordingInfo,
  SensorRanges,
  WindowCrop,
} from './RecordingInfo';
import { InfoRecordFormat } from '../constants';
import { GyroViewError } from '../../../shared/errors/GyroViewError';
import { ProtobufMessage } from '../../../shared/protobuf/ProtobufMessage';

import {
  milliseconds,
  millisecondsToSeconds,
  type Milliseconds,
  type Seconds,
} from '../../../shared/units/time';
import type { FrameTimeSourceName } from '../../motion/timing/FrameTimeSource';

/**
 * Turns the info record into a {@link RecordingInfo}. Only the protobuf encoding (format 1) is
 * understood; the JSON encoding documented for some firmware has never been observed.
 */
export function parseInfoRecord(payload: Uint8Array, format: number): RecordingInfo {
  if (format !== InfoRecordFormat.Protobuf) {
    throw new GyroViewError(
      'unsupported-info-format',
      `info record uses format ${format}; only protobuf (${InfoRecordFormat.Protobuf}) is supported`,
    );
  }
  const message = ProtobufMessage.decode(payload);
  return {
    serialNumber: message.string(InfoField.SerialNumber),
    model: message.string(InfoField.Model),
    firmware: message.string(InfoField.Firmware),
    calibration: calibrationStringsOf(message),
    dimension: dimensionOf(message.message(InfoField.Dimension)),
    frameRate: message.varint(InfoField.FrameRate),
    captureMode: message.string(InfoField.CaptureMode),
    firstFrameTimestamp: message.varint(InfoField.FirstFrameTimestamp),
    readoutTime: secondsFromMilliseconds(message.double(InfoField.RollingShutterTimeMs)),
    fileGroup: fileGroupOf(message.message(InfoField.FileGroupInfo)),
    windowCrop: windowCropOf(message.message(InfoField.WindowCropInfo)),
    gyroOffset: optionalMilliseconds(message.double(InfoField.GyroTimestampMs)),
    totalFrames: message.varint(InfoField.TotalFrames),
    gyroType: message.varint(InfoField.GyroType),
    isRawGyro: message.boolean(InfoField.IsRawGyro),
    preferredFrameTimeSource: frameTimeSourceOf(message.varint(InfoField.PtsType)),
    sensorRanges: sensorRangesOf(message.message(InfoField.GyroConfig)),
    fileLayout: message.varint(InfoField.FileLayout),
    trackOrder: message.varint(InfoField.TrackOrder),
  };
}

function secondsFromMilliseconds(value: number | undefined): Seconds | undefined {
  return value === undefined ? undefined : millisecondsToSeconds(milliseconds(value));
}

function optionalMilliseconds(value: number | undefined): Milliseconds | undefined {
  return value === undefined ? undefined : milliseconds(value);
}

/**
 * Other `pts_type` values have never been observed and say nothing to rely on.
 */
function frameTimeSourceOf(ptsType: number | undefined): FrameTimeSourceName | undefined {
  if (ptsType === PtsType.TrackTimestamps) return 'track-timestamps';
  return ptsType === PtsType.ExposureRecord ? 'exposure-record' : undefined;
}

function calibrationStringsOf(message: ProtobufMessage): CalibrationStrings {
  return {
    offset: message.string(InfoField.Offset),
    offsetV2: message.string(InfoField.OffsetV2),
    offsetV3: message.string(InfoField.OffsetV3),
  };
}

function dimensionOf(message: ProtobufMessage | undefined): LensDimension | undefined {
  const width = message?.varint(DimensionField.Width);
  const height = message?.varint(DimensionField.Height);
  return width === undefined || height === undefined ? undefined : { width, height };
}

function fileGroupOf(message: ProtobufMessage | undefined): FileGroup | undefined {
  return message === undefined
    ? undefined
    : {
        type: message.varint(FileGroupField.Type),
        index: message.varint(FileGroupField.Index),
        identify: message.string(FileGroupField.Identify),
        total: message.varint(FileGroupField.Total),
      };
}

function windowCropOf(message: ProtobufMessage | undefined): WindowCrop | undefined {
  return message === undefined
    ? undefined
    : {
        sensorWidth: message.varint(WindowCropField.SensorWidth),
        sensorHeight: message.varint(WindowCropField.SensorHeight),
        cropWidth: message.varint(WindowCropField.CropWidth),
        cropHeight: message.varint(WindowCropField.CropHeight),
        cropOffsetX: message.varint(WindowCropField.CropOffsetX),
        cropOffsetY: message.varint(WindowCropField.CropOffsetY),
      };
}

function sensorRangesOf(message: ProtobufMessage | undefined): SensorRanges | undefined {
  return message === undefined
    ? undefined
    : {
        accelerometerG: message.varint(GyroConfigField.AccelerometerRangeG),
        gyroscopeDps: message.varint(GyroConfigField.GyroscopeRangeDps),
      };
}
