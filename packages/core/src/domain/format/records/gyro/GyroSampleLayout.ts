import type { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Vector3 } from '../../../../shared/math/Vector3';
import type { Microseconds } from '../../../../shared/units/time';

/**
 * Strategy that knows how one sample is laid out in the gyro record and how to convert it to
 * SI-ish units (g, radians per second, microseconds).
 */
export interface GyroSampleLayout {
  readonly name: 'raw' | 'float';
  readonly sampleSize: number;
  timestampAt(reader: ByteReader, offset: number): Microseconds;
  accelerationAt(reader: ByteReader, offset: number): Vector3;
  angularVelocityAt(reader: ByteReader, offset: number): Vector3;
}
