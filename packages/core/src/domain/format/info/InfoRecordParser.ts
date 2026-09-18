import {
  DimensionField,
  FileGroupField,
  GyroConfigField,
  InfoField,
  WindowCropField,
} from './infoFields';
import type {
  FileGroup,
  LensDimension,
  RecordingInfo,
  SensorRanges,
  WindowCrop,
} from './RecordingInfo';
import { ProtobufMessage } from '../../../shared/protobuf/ProtobufMessage';

/**
 * Turns the protobuf info record into a {@link RecordingInfo}.
 */
export class InfoRecordParser {
  public parse(payload: Uint8Array): RecordingInfo {
    const message = ProtobufMessage.decode(payload);
    return {
      serialNumber: message.string(InfoField.SerialNumber),
      model: message.string(InfoField.Model),
      firmware: message.string(InfoField.Firmware),
      calibration: {
        offset: message.string(InfoField.Offset),
        offsetV2: message.string(InfoField.OffsetV2),
        offsetV3: message.string(InfoField.OffsetV3),
      },
      dimension: this.dimension(message.message(InfoField.Dimension)),
      frameRate: message.varint(InfoField.FrameRate),
      captureMode: message.string(InfoField.CaptureMode),
      firstFrameTimestamp: message.varint(InfoField.FirstFrameTimestamp),
      rollingShutterTimeMs: message.double(InfoField.RollingShutterTimeMs),
      fileGroup: this.fileGroup(message.message(InfoField.FileGroupInfo)),
      windowCrop: this.windowCrop(message.message(InfoField.WindowCropInfo)),
      gyroTimestampMs: message.double(InfoField.GyroTimestampMs),
      totalFrames: message.varint(InfoField.TotalFrames),
      gyroType: message.varint(InfoField.GyroType),
      isRawGyro: message.boolean(InfoField.IsRawGyro),
      ptsType: message.varint(InfoField.PtsType),
      sensorRanges: this.sensorRanges(message.message(InfoField.GyroConfig)),
      fileLayout: message.varint(InfoField.FileLayout),
      trackOrder: message.varint(InfoField.TrackOrder),
    };
  }

  private dimension(message: ProtobufMessage | undefined): LensDimension | undefined {
    const width = message?.varint(DimensionField.Width);
    const height = message?.varint(DimensionField.Height);
    return width === undefined || height === undefined ? undefined : { width, height };
  }

  private fileGroup(message: ProtobufMessage | undefined): FileGroup | undefined {
    return message
      ? {
          type: message.varint(FileGroupField.Type),
          index: message.varint(FileGroupField.Index),
          identify: message.string(FileGroupField.Identify),
          total: message.varint(FileGroupField.Total),
        }
      : undefined;
  }

  private windowCrop(message: ProtobufMessage | undefined): WindowCrop | undefined {
    return message
      ? {
          sensorWidth: message.varint(WindowCropField.SensorWidth),
          sensorHeight: message.varint(WindowCropField.SensorHeight),
          cropWidth: message.varint(WindowCropField.CropWidth),
          cropHeight: message.varint(WindowCropField.CropHeight),
          cropOffsetX: message.varint(WindowCropField.CropOffsetX),
          cropOffsetY: message.varint(WindowCropField.CropOffsetY),
        }
      : undefined;
  }

  private sensorRanges(message: ProtobufMessage | undefined): SensorRanges | undefined {
    return message
      ? {
          accelerometerG: message.varint(GyroConfigField.AccelerometerRangeG),
          gyroscopeDps: message.varint(GyroConfigField.GyroscopeRangeDps),
        }
      : undefined;
  }
}
