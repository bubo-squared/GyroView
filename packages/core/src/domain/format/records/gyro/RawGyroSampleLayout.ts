import type { GyroSampleLayout } from './GyroSampleLayout';
import {
  DEFAULT_ACCELEROMETER_RANGE_G,
  DEFAULT_GYROSCOPE_RANGE_DPS,
  RAW_ACCELERATION_OFFSET,
  RAW_ANGULAR_VELOCITY_OFFSET,
  RAW_COMPONENT_SIZE,
  RAW_FULL_SCALE,
  RAW_SAMPLE_SIZE,
  RAW_TIMESTAMP_OFFSET,
  RAW_ZERO_POINT,
} from './gyroLayouts';
import type { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Vector3 } from '../../../../shared/math/Vector3';
import { degrees, degreesToRadians } from '../../../../shared/units/angle';
import type { Microseconds } from '../../../../shared/units/time';
import type { SensorRanges } from '../../info/RecordingInfo';

/**
 * Compact 20-byte samples written by X5-era firmware (`is_raw_gyro` = 1).
 */
export class RawGyroSampleLayout implements GyroSampleLayout {
  public readonly name = 'raw';
  public readonly sampleSize = RAW_SAMPLE_SIZE;
  private readonly accelerationScale: number;
  private readonly angularVelocityScale: number;

  public constructor(ranges: Partial<SensorRanges> = {}) {
    const accelerometerG = ranges.accelerometerG ?? DEFAULT_ACCELEROMETER_RANGE_G;
    const gyroscopeDps = ranges.gyroscopeDps ?? DEFAULT_GYROSCOPE_RANGE_DPS;
    this.accelerationScale = accelerometerG / RAW_FULL_SCALE;
    this.angularVelocityScale = degreesToRadians(degrees(gyroscopeDps)) / RAW_FULL_SCALE;
  }

  public timestampAt(reader: ByteReader, offset: number): Microseconds {
    return reader.uint64LeAt(offset + RAW_TIMESTAMP_OFFSET) as Microseconds;
  }

  public accelerationAt(reader: ByteReader, offset: number): Vector3 {
    return this.vectorAt(reader, offset + RAW_ACCELERATION_OFFSET, this.accelerationScale);
  }

  public angularVelocityAt(reader: ByteReader, offset: number): Vector3 {
    return this.vectorAt(reader, offset + RAW_ANGULAR_VELOCITY_OFFSET, this.angularVelocityScale);
  }

  private vectorAt(reader: ByteReader, offset: number, scale: number): Vector3 {
    return [
      this.componentAt(reader, offset, scale),
      this.componentAt(reader, offset + RAW_COMPONENT_SIZE, scale),
      this.componentAt(reader, offset + 2 * RAW_COMPONENT_SIZE, scale),
    ];
  }

  private componentAt(reader: ByteReader, offset: number, scale: number): number {
    return (reader.uint16LeAt(offset) - RAW_ZERO_POINT) * scale;
  }
}
