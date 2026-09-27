import type { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Vector3 } from '../../../../shared/math/Vector3';
import type { Microseconds } from '../../../../shared/units/time';

/**
 * How far a flipped high bit moves one component of a reading, in the reading's unit, for each
 * bit that matters.
 */
export interface FlipSteps {
  readonly acceleration: readonly number[];
  readonly angularVelocity: readonly number[];
}

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
   * None where a flipped bit lands a reading beyond any plausible one instead, and the bounds
   * leave it out (see parseGyroRecord).
   */
  readonly flipSteps: FlipSteps;
  /**
   * The info record stamps its capture-clock fields in the unit this layout stamps its samples;
   * this turns one such value into microseconds.
   */
  captureTimeOf(stamp: number): Microseconds;
  timestampAt(reader: ByteReader, offset: number): Microseconds;
  accelerationAt(reader: ByteReader, offset: number): Vector3;
  angularVelocityAt(reader: ByteReader, offset: number): Vector3;
}
