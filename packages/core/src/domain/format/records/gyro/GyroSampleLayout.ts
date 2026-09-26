import type { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Vector3 } from '../../../../shared/math/Vector3';
import type { Microseconds } from '../../../../shared/units/time';

/**
 * Strategy that knows how one sample is laid out in the gyro record and how to convert it to
 * SI-ish units (g, radians per second, microseconds).
 */
export interface GyroSampleLayout {
  /**
   * How reports name the layout.
   */
  readonly name: string;
  readonly sampleSize: number;
  /**
   * The info record stamps its capture-clock fields in the unit this layout stamps its samples;
   * this turns one such value into microseconds.
   */
  captureTimeOf(stamp: number): Microseconds;
  timestampAt(reader: ByteReader, offset: number): Microseconds;
  accelerationAt(reader: ByteReader, offset: number): Vector3;
  angularVelocityAt(reader: ByteReader, offset: number): Vector3;
}
