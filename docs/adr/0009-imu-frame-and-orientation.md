# ADR 0009: IMU frame, orientation integration and stabilization modes

Status: accepted (2026-09-20), verified on the X5 office and sailing recordings

## Context

Stabilization needs the camera's orientation for every frame. The gyro record gives angular
velocity and specific force at 1 kHz in the IMU's own axes; nothing in the file says how those
axes lie in the camera body, and Insta360 does not document it. Gyroflow keeps a per-model table
(`imu_orientation`), which the plan allowed only as a seed to be verified against the data.

## Decisions

- **Body frame** for motion is the stitching body frame of ADR 0008 (x right, y down, z along
  lens 0). **World frame**: y down along gravity, z the body's forward at the start of the
  recording projected onto the horizontal plane.
- **Orientation** (`OrientationTrack`): the gyro is integrated with the rate measured at the
  start of each interval, bias-corrected from the stillest half second when that window's mean
  rate is below one degree per second (otherwise no bias is assumed: a camera that never rests
  must not have its slowest real motion subtracted), and pulled towards the accelerometer with a
  Mahony proportional term (gain 0.2) whenever the specific force lies within 0.9-1.1 g. The
  initial pose levels the gravity of the opening half second with no yaw (identity when the
  camera accelerates then; the pull levels it within seconds).
- **IMU frame** (`imuFrameFor`): chosen from the camera model in the info record. On the X5 the
  IMU sits a quarter turn about the camera's lateral axis: body x = IMU x, body y = IMU z,
  body z = -IMU y. The same frame fits recordings from firmware 1.7 and 1.11. Other cameras get
  an unverified aligned default, reported as such.
- **Modes** (`Stabilizer` strategies): `off`, `lock` (view fixed to the world), `horizon` (roll
  and pitch removed, heading follows the camera), `follow` (view low-passes the camera direction
  with a 1.5 s time constant, resetting on a seek). The renderer applies the resulting rotation
  between the view rotation and the lens poses (`PictureRenderer.setStabilization`); the
  `StabilizingFrameSink` use case samples the orientation at each frame's mid-exposure time.

## Evidence

- Gyro and accelerometer axes agree in the raw IMU frame: integrating the gyro over two-second
  windows predicts the accelerometer's gravity direction within 5 degrees, against 19 degrees
  without the gyro and 19 degrees or worse for every other axis arrangement.
- The full filter keeps its estimated down within 4 degrees of the accelerometer over the whole
  sailing clip in any frame: the filter is self-consistent, so the frame cannot be verified from
  the IMU alone, and reading levelness off equirectangular renders by eye proved unreliable
  (two wrong frames each looked level on some frames).
- The lock render is the rigid rotation of the unstabilized render by the estimated orientation
  (mean colour difference 5.6 of 255 over 400 probe directions), so rendering is faithful.
- The deciding test is `imuMappingRanking.test.ts`: in lock mode the world must stand still, so
  for each of the 24 axis arrangements it integrates the orientation, renders pairs half a second
  apart under lock and measures how much the picture moved. The `x, z, -y` frame wins on both
  recordings (sailing 25.5 against 32.8 unstabilized and 32.4 for the runner-up; office 14.0
  against 16.0 and 15.6); every other arrangement is no better than leaving the picture alone.

## Alternatives considered

- Deriving the frame from two gravity observations and the pictures: the pictures were misread
  and gave a different, wrong frame per recording; only the stillness ranking is trustworthy.
- Verifying the frame automatically at playback (rendering the 24 candidates): possible with
  the same method, but a full ranking costs a few seconds of decoding and rendering; left for a
  later phase, if a camera without a measured frame turns up.

## Consequences

Cameras other than the X5 stabilize with an unverified frame until a recording is measured; the
player must surface `ImuFrame.isVerified` as a warning and offer `off`. A new camera is measured
by adding its recording to the ranking test. The residual motion in lock mode on the sailing
recording comes from the boat and people moving and from the accelerometer sensing the boat's
acceleration; the horizon itself stays level.
