import type { GyroSampleLayout } from './GyroSampleLayout';
import {
  FLOAT_ACCELERATION_OFFSET,
  FLOAT_ANGULAR_VELOCITY_OFFSET,
  FLOAT_COMPONENT_SIZE,
  FLOAT_SAMPLE_SIZE,
  FLOAT_TIMESTAMP_OFFSET,
} from './gyroLayouts';
import type { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Vector3 } from '../../../../shared/math/Vector3';
import { milliseconds, millisecondsToMicroseconds } from '../../../../shared/units/time';
import type { Microseconds } from '../../../../shared/units/time';

/**
 * 56-byte samples with float64 components, written by cameras before the raw layout.
 */
export class FloatGyroSampleLayout implements GyroSampleLayout {
  public readonly name = 'float';
  public readonly sampleSize = FLOAT_SAMPLE_SIZE;

  public timestampAt(reader: ByteReader, offset: number): Microseconds {
    return millisecondsToMicroseconds(
      milliseconds(reader.uint64LeAt(offset + FLOAT_TIMESTAMP_OFFSET)),
    );
  }

  public accelerationAt(reader: ByteReader, offset: number): Vector3 {
    return this.vectorAt(reader, offset + FLOAT_ACCELERATION_OFFSET);
  }

  public angularVelocityAt(reader: ByteReader, offset: number): Vector3 {
    return this.vectorAt(reader, offset + FLOAT_ANGULAR_VELOCITY_OFFSET);
  }

  private vectorAt(reader: ByteReader, offset: number): Vector3 {
    return [
      reader.float64LeAt(offset),
      reader.float64LeAt(offset + FLOAT_COMPONENT_SIZE),
      reader.float64LeAt(offset + 2 * FLOAT_COMPONENT_SIZE),
    ];
  }
}
