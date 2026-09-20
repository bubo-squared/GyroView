import {
  imuFrameFor,
  OrientationTrack,
  type CaptureClock,
  type ImuFrame,
  type Recording,
} from '@gyroview/core';

/**
 * What stabilization needs: the camera's orientation over the recording and the IMU frame it
 * was integrated with (reported so embedders know when it is a guess).
 */
export interface MotionSetup {
  readonly orientations: OrientationTrack;
  readonly imuFrame: ImuFrame;
}

export interface MotionResolution {
  readonly setup: MotionSetup | undefined;
  readonly warnings: readonly string[];
}

const NO_GYRO_WARNING = 'the recording has no gyro record; stabilization is unavailable';

/**
 * Integrates the gyro record when there is one. A camera whose IMU frame has never been
 * measured still gets stabilization, with a warning, because the aligned guess is right for
 * some cameras and the ranking test can confirm it later.
 */
export async function motionSetupFor(
  recording: Recording,
  clock: CaptureClock,
): Promise<MotionResolution> {
  const gyro = await recording.readGyroRecord();
  if (!gyro) return { setup: undefined, warnings: [NO_GYRO_WARNING] };
  const imuFrame = imuFrameFor(recording.info);
  const orientations = OrientationTrack.integrate({ gyro: gyro.track, clock, frame: imuFrame });
  return { setup: { orientations, imuFrame }, warnings: unverifiedWarningsOf(imuFrame, recording) };
}

function unverifiedWarningsOf(imuFrame: ImuFrame, recording: Recording): readonly string[] {
  if (imuFrame.isVerified) return [];
  const camera = recording.info.model ?? 'this camera';
  return [
    `the IMU frame of ${camera} has not been verified on a recording; stabilization may misbehave`,
  ];
}
