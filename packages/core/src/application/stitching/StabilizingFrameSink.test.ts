import { describe, expect, it } from 'vitest';

import { StabilizingFrameSink } from './StabilizingFrameSink';
import { ALIGNED_IMU_FRAME } from '../../domain/motion/imu/ImuFrame';
import { OrientationTrack } from '../../domain/motion/orientation/OrientationTrack';
import { LockStabilization } from '../../domain/motion/stabilization/stabilizers';
import { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import type { Presentation, StabilizableFrameSink } from '../../ports/FrameSink';
import { IDENTITY_MATRIX3, transformVector, type Matrix3 } from '../../shared/math/Matrix3';
import type { Vector3 } from '../../shared/math/Vector3';
import { seconds } from '../../shared/units/time';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../test/support/syntheticGyro';

const FORWARD: Vector3 = [0, 0, 1];

class RecordingSink implements StabilizableFrameSink<string> {
  public readonly rotations: Matrix3[] = [];
  public readonly presented: Presentation<string>[] = [];

  public setStabilization(rotation: Matrix3): void {
    this.rotations.push(rotation);
  }

  public present(presentation: Presentation<string>): void {
    this.presented.push(presentation);
  }
}

/**
 * A camera that turns a quarter turn per second about the vertical from the start.
 */
const orientations = OrientationTrack.integrate({
  gyro: syntheticGyroTrack(4, 200, () => ({
    acceleration: RESTING_UPRIGHT,
    angularVelocity: [0, Math.PI / 2, 0],
  })),
  clock: SYNTHETIC_CLOCK,
  frame: ALIGNED_IMU_FRAME,
});

function presentationAt(timestamp: number): Presentation<string> {
  return { pair: { timestamp: seconds(timestamp), frames: [] }, mediaTime: seconds(timestamp) };
}

function frameTimesAt(times: readonly number[], readoutTime: number): FrameTimes {
  const captureTimes = Float64Array.from(
    times.map((time) => SYNTHETIC_CLOCK.captureTimeOf(seconds(time))),
  );
  return FrameTimes.withoutShutterTimes(SYNTHETIC_CLOCK, captureTimes, seconds(readoutTime));
}

function forwardThrough(sink: RecordingSink): Vector3 {
  return transformVector(sink.rotations[0] ?? IDENTITY_MATRIX3, FORWARD);
}

describe('StabilizingFrameSink', () => {
  it('passes the picture through unturned in the default off mode', () => {
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({ sink: inner, orientations, frameTimes: undefined });
    sink.present(presentationAt(1));
    expect(inner.rotations).toEqual([IDENTITY_MATRIX3]);
    expect(inner.presented).toHaveLength(1);
  });

  it('turns the picture by the camera orientation at the frame time in lock mode', () => {
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({ sink: inner, orientations, frameTimes: undefined });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(1));
    const forwardInBody = forwardThrough(inner);
    expect(forwardInBody[0]).toBeCloseTo(-1, 2);
    expect(forwardInBody[2]).toBeCloseTo(0, 2);
  });

  it('falls back to the pair timestamp when the frame times hold no frames', () => {
    const inner = new RecordingSink();
    const frameTimes = frameTimesAt([], 0);
    const sink = new StabilizingFrameSink({ sink: inner, orientations, frameTimes });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(1));
    expect(forwardThrough(inner)[0]).toBeCloseTo(-1, 2);
  });

  it('samples the orientation at the mid-exposure of the frame the pair shows', () => {
    const inner = new RecordingSink();
    // A two-second readout puts the first frame's mid-exposure a second after its capture.
    const frameTimes = frameTimesAt([0, 3, 6], 2);
    const sink = new StabilizingFrameSink({ sink: inner, orientations, frameTimes });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(0.5));
    expect(forwardThrough(inner)[0]).toBeCloseTo(-1, 2);
  });
});
