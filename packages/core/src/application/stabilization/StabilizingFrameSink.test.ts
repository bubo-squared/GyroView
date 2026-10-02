import { describe, expect, it } from 'vitest';

import { StabilizingFrameSink } from './StabilizingFrameSink';
import { ALIGNED_IMU_FRAME } from '../../domain/motion/imu/ImuFrame';
import {
  mountingOf,
  uprightImuFrame,
  UPRIGHT_MOUNTING,
  type Mounting,
} from '../../domain/motion/mounting/Mounting';
import { OrientationTrack } from '../../domain/motion/orientation/OrientationTrack';
import {
  HorizonStabilization,
  LockStabilization,
} from '../../domain/motion/stabilization/stabilizers';
import { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import type { Presentation } from '../../ports/FrameSink';
import type { PictureRenderer } from '../../ports/PictureRenderer';
import {
  IDENTITY_MATRIX3,
  rotationAboutX,
  transformVector,
  type Matrix3,
} from '../../shared/math/Matrix3';
import { radians } from '../../shared/units/angle';
import type { Vector3 } from '../../shared/math/Vector3';
import { seconds } from '../../shared/units/time';
import {
  RESTING_UPRIGHT,
  SYNTHETIC_CLOCK,
  syntheticGyroTrack,
} from '../../../test/support/syntheticGyro';

const FORWARD: Vector3 = [0, 0, 1];
const DOWN: Vector3 = [0, 1, 0];
const STILL: Vector3 = [0, 0, 0];
/**
 * A drone's camera, lens 0 up: the upright frame's down is the body's minus z.
 */
const LENS_0_UP: Mounting = {
  name: 'with lens 0 up',
  toBody: rotationAboutX(radians(-Math.PI / 2)),
};

class RecordingSink implements Pick<PictureRenderer<string>, 'present' | 'setStabilization'> {
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

/**
 * A camera on its right side, gravity along the body's x, that rests for a second and then
 * pitches an eighth of a turn in the next about its upright frame's lateral axis, the body's
 * minus y.
 */
const PITCH = Math.PI / 4;
const PITCH_START = 1;
const PITCH_END = 2;
const pitchingOnItsSide = syntheticGyroTrack(3, 200, (time) => {
  const progress = Math.min(Math.max(time - PITCH_START, 0), PITCH_END - PITCH_START);
  const pitch = (PITCH * progress) / (PITCH_END - PITCH_START);
  const isPitching = time >= PITCH_START && time < PITCH_END;
  return {
    acceleration: [-Math.cos(pitch), 0, Math.sin(pitch)],
    angularVelocity: isPitching ? [0, -PITCH / (PITCH_END - PITCH_START), 0] : STILL,
  };
});

function presentationAt(timestamp: number): Presentation<string> {
  return { pair: { timestamp: seconds(timestamp), frames: [] }, mediaTime: seconds(timestamp) };
}

function frameTimesAt(times: readonly number[], shutterTime: number): FrameTimes {
  const captureTimes = Float64Array.from(
    times.map((time) => SYNTHETIC_CLOCK.captureTimeOf(seconds(time))),
  );
  return new FrameTimes({
    clock: SYNTHETIC_CLOCK,
    captureTimes,
    shutterTimes: captureTimes.map(() => shutterTime),
    frameDuration: undefined,
  });
}

function forwardThrough(sink: RecordingSink): Vector3 {
  return transformVector(sink.rotations[0] ?? IDENTITY_MATRIX3, FORWARD);
}

describe('StabilizingFrameSink', () => {
  it('passes the picture through unturned in the default off mode', () => {
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: { orientations, mounting: UPRIGHT_MOUNTING },
      frameTimes: undefined,
    });
    sink.present(presentationAt(1));
    expect(inner.rotations).toEqual([IDENTITY_MATRIX3]);
    expect(inner.presented).toHaveLength(1);
  });

  it('turns the picture by the camera orientation at the frame time in lock mode', () => {
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: { orientations, mounting: UPRIGHT_MOUNTING },
      frameTimes: undefined,
    });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(1));
    const forwardInBody = forwardThrough(inner);
    expect(forwardInBody[0]).toBeCloseTo(-1, 2);
    expect(forwardInBody[2]).toBeCloseTo(0, 2);
  });

  it("turns the picture from the camera's upright frame into its body by the mounting", () => {
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: { orientations, mounting: LENS_0_UP },
      frameTimes: undefined,
    });
    sink.present(presentationAt(1));
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(1));
    const [off, lock] = inner.rotations.map((rotation) => transformVector(rotation, DOWN));
    expect(off?.[2]).toBeCloseTo(-1, 9);
    expect(lock?.[2]).toBeCloseTo(-1, 2);
    expect(transformVector(inner.rotations[1] ?? IDENTITY_MATRIX3, FORWARD)[0]).toBeCloseTo(-1, 2);
  });

  it('keeps the horizon facing where a camera on its side faces while it pitches', () => {
    const measured = { ...ALIGNED_IMU_FRAME, isVerified: true };
    const mounting = mountingOf(pitchingOnItsSide, measured);
    const inner = new RecordingSink();
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: {
        orientations: OrientationTrack.integrate({
          gyro: pitchingOnItsSide,
          clock: SYNTHETIC_CLOCK,
          frame: uprightImuFrame(measured, mounting),
        }),
        mounting,
      },
      frameTimes: undefined,
    });
    sink.setStabilizer(new HorizonStabilization());
    sink.present(presentationAt(2.5));
    const viewForward = forwardThrough(inner);
    expect(mounting.name).toBe('on its right side');
    // The pitch about the body's y has not become a heading turning the view toward it.
    expect(viewForward[1]).toBeCloseTo(0, 2);
    expect(viewForward[2]).toBeCloseTo(Math.cos(PITCH), 2);
  });

  it('falls back to the pair timestamp when the frame times hold no frames', () => {
    const inner = new RecordingSink();
    const frameTimes = frameTimesAt([], 0);
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: { orientations, mounting: UPRIGHT_MOUNTING },
      frameTimes,
    });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(1));
    expect(forwardThrough(inner)[0]).toBeCloseTo(-1, 2);
  });

  it('samples the orientation at the mid-exposure of the frame the pair shows', () => {
    const inner = new RecordingSink();
    // A two-second shutter puts the first frame's mid-exposure a second after its capture.
    const frameTimes = frameTimesAt([0, 3, 6], 2);
    const sink = new StabilizingFrameSink({
      sink: inner,
      motion: { orientations, mounting: UPRIGHT_MOUNTING },
      frameTimes,
    });
    sink.setStabilizer(new LockStabilization());
    sink.present(presentationAt(0.5));
    expect(forwardThrough(inner)[0]).toBeCloseTo(-1, 2);
  });
});
