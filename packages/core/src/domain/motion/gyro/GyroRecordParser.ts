import { FloatGyroSampleLayout } from './FloatGyroSampleLayout';
import type { GyroSampleLayout } from './GyroSampleLayout';
import { GyroTrack } from './GyroTrack';
import { RawGyroSampleLayout, type SensorRangeOptions } from './RawGyroSampleLayout';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

const COMPONENTS = 3;

export interface GyroRecordHints {
  /**
   * `is_raw_gyro` from the info record when present; otherwise the layout is inferred from the
   * payload size.
   */
  readonly isRawGyro?: boolean | undefined;
  readonly ranges?: SensorRangeOptions | undefined;
}

/**
 * Decodes the gyro record payload into a {@link GyroTrack}, choosing the sample layout from the
 * info record hint or, failing that, from which sample size divides the payload.
 */
export class GyroRecordParser {
  public parse(payload: Uint8Array, hints: GyroRecordHints = {}): GyroTrack {
    const layout = this.chooseLayout(payload.byteLength, hints);
    const count = Math.floor(payload.byteLength / layout.sampleSize);
    const reader = new ByteReader(payload);
    const timestamps = new Float64Array(count);
    const accelerations = new Float32Array(count * COMPONENTS);
    const angularVelocities = new Float32Array(count * COMPONENTS);
    for (let index = 0; index < count; index += 1) {
      const offset = index * layout.sampleSize;
      timestamps[index] = layout.timestampAt(reader, offset);
      accelerations.set(layout.accelerationAt(reader, offset), index * COMPONENTS);
      angularVelocities.set(layout.angularVelocityAt(reader, offset), index * COMPONENTS);
    }
    return new GyroTrack(timestamps, accelerations, angularVelocities);
  }

  public chooseLayout(payloadSize: number, hints: GyroRecordHints): GyroSampleLayout {
    const raw = new RawGyroSampleLayout(hints.ranges);
    const float = new FloatGyroSampleLayout();
    if (hints.isRawGyro !== undefined) return hints.isRawGyro ? raw : float;
    const isRawSized = payloadSize % raw.sampleSize === 0;
    const isFloatSized = payloadSize % float.sampleSize === 0;
    if (isRawSized !== isFloatSized) return isRawSized ? raw : float;
    throw new GyroViewError(
      'invalid-gyro-record',
      `cannot tell the gyro sample layout from a ${payloadSize}-byte payload without the info record`,
    );
  }
}
