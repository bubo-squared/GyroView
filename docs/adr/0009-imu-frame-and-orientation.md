# ADR 0009: IMU frame, orientation integration and stabilization modes

Status: accepted (2026-09-20), verified on the X5 office and sailing recordings; the X6, the
X4 Air, the Antigravity A1 and the X3 on one recording each; the ONE RS's down measured, the
rest of its frame assumed

## Context

Stabilization needs the camera's orientation for every frame. The gyro record gives angular
velocity and specific force at 1 kHz in the IMU's own axes; nothing in the file says how those
axes lie in the camera body, and Insta360 does not document it. Gyroflow keeps a per-model table
(`imu_orientation`), which the plan allowed only as a seed to be verified against the data.

## Decisions

- **Body frame** for motion is the stitching body frame of ADR 0008 (x right, y down, z along
  lens 0). **World frame**: y down along gravity, z the body's forward at the start of the
  recording projected onto the horizontal plane; since ADR 0038 and ADR 0039, the forward of
  the mounting's upright frame, where Insta360 Studio centres the recording.
- **Orientation** (`OrientationTrack`): the gyro is integrated with the rate measured at the
  start of each interval, bias-corrected from the stillest half second when that window's mean
  rate is below one degree per second (otherwise no bias is assumed: a camera that never rests
  must not have its slowest real motion subtracted), and pulled towards the accelerometer with a
  Mahony proportional term (gain 0.2) whenever the specific force lies within 0.9-1.1 g. The
  initial pose levels the gravity of the opening half second with no yaw (identity when the
  camera accelerates then; the pull levels it within seconds).
- **IMU frame** (`imuFrameFor`): chosen by the whole camera model name in the info record. On
  the X5 the IMU sits a quarter turn about the camera's lateral axis: body x = IMU x, body y =
  IMU z, body z = -IMU y. The same frame fits recordings from firmware 1.7 and 1.11. A camera
  without a measured frame gets an assumed one, reported as unverified: the ONE RS's, its down
  measured, or else the aligned default.
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
- The deciding measurement is `imuFrameRanking.test.ts` (`pnpm measure`): in lock mode the world
  must stand still, so for each of the 24 axis arrangements it integrates the orientation,
  renders pairs half a second apart under lock and measures how much the picture moved. The
  `x, z, -y` frame wins on both recordings (sailing 25.5 against 32.8 unstabilized and 32.4 for
  the runner-up; office 14.0 against 16.0 and 15.6); every other arrangement is no better than
  leaving the picture alone.

## Alternatives considered

- Deriving the frame from two gravity observations and the pictures: the pictures were misread
  and gave a different, wrong frame per recording; only the stillness ranking is trustworthy.
- Verifying the frame automatically at playback (rendering the 24 candidates): possible with
  the same method, but a full ranking costs a few seconds of decoding and rendering; left for a
  later phase, if a camera without a measured frame turns up.

## Consequences

Cameras without a measured frame (all but the X5, the X6, the X4 Air, the A1 and the X3) stabilize
with an unverified frame until a recording is measured; the player must surface
`ImuFrame.isVerified` as a warning and offer `off`, which draws such a camera's body as recorded: a
guessed frame reads no mounting (ADR 0038). A new camera is measured by adding its recording to the
ranking and running `pnpm measure`; every test run keeps a cheaper guard, that lock keeps the
sailing recording's world stiller than no stabilization. The residual motion in lock mode on the
sailing recording comes from the boat and people moving and from the accelerometer sensing the
boat's acceleration; the horizon itself stays level.

## On the X6 (2026-09-30)

One X6 recording, ranked at five moments of a 9-second clip (a private sample, ADR 0031): the
X5's arrangement (`x,z,-y`, the IMU a quarter turn about the lateral axis) keeps the world
stillest, 7.4 against 14.6 unstabilized and 13.5 for the runner-up, alike in Chromium and
WebKit. `X6_IMU_FRAME` is that arrangement, measured; the X5 and the X6 share its axes
(`QUARTER_TURN_ABOUT_LATERAL`). Provisional until a second unit or a longer clip confirms it.

## Since ADR 0034 (2026-10-01)

A frame's mid-exposure time is its capture time plus half its shutter: the half readout the
player added put the gyro's orientation half a readout late (10.6 ms on the X5 at 8K30), and
the X6's stabilized world swayed with the camera.

## On the X4 Air (2026-10-01)

One X4 Air recording (one file holding a track per lens, a local sample, ADR 0031), ranked at
nine moments of its 15 seconds: the X5's arrangement keeps the world stillest, 21.5 against 29.7
unstabilized and 26.3 for the runner-up, alike in Chromium and WebKit, about the X5 recordings'
own margin. The aligned frame the X4 Air fell back to ranks third, at 26.6: it got the pan right
and turned tilt and roll about the wrong axes, so the stabilized picture still swayed.
`X4_AIR_IMU_FRAME` is the X5's arrangement, measured. With it the gyro's timing is consistent
with the frame's own time, as ADR 0034 has it: 0.6 ms off, with a standard error of 2.5 ms over
16 moments.

The camera stood upright through the clip, gravity along the IMU's x, as on the X5 sailing
recording: the four frames ranked first are the four quarter turns about that axis, which map
gravity and pan alike and differ only in tilt and roll. Only the clip's tilt and roll tell them
apart, never gravity; provisional until a recording held another way (on its side, or flat on a
table) confirms it, as the office and krnjaca recordings confirmed the X5's.

From here on the model is matched by its whole name: the X4 Air's extends the X4's, and a name
that extends a measured one ("Insta360 X5 Pro") belongs to another camera, unmeasured until it
is ranked.

## On the Antigravity A1 (2026-10-03)

One A1 recording (a drone, its lenses one up and one down; a local sample, ADR 0031), ranked at
nine moments of its 43 seconds, most in flight: `-z,-x,y` keeps the world stillest, 9.1 against
15.3 unstabilized and 12.9 for the runner-up, alike in Chromium and WebKit. Gravity lies along
the IMU's y, which this frame puts along lens 0's axis, lens 0 facing up; the three frames ranked
first all do, and the drone's tilts in flight told them apart. The X5's arrangement ranks fourth:
the A1's IMU sits otherwise. `A1_IMU_FRAME` is the winner, measured. With it the gyro's timing
agrees with the frames' (ADR 0034): 0.1 ms off, with a standard error of 2.4 ms over 16 moments,
though the recording's exposure record falls short of its video and the frames are timed by the
track; the far field sways 0.035 degrees rms under lock, as the X6's does. The drone's picture
stands upright in every mode by its mounting (ADR 0038).

## On the X3 and the ONE RS: the levelling ranking (2026-10-03)

One X3 recording and one ONE RS 1-inch 360 recording, both local samples (ADR 0031) and each
written as one file per lens, stood still on a tripod through their video. Under the aligned guess,
lock and horizon drew the ONE RS on its side: its gravity lies along the IMU's x, which the guess
put on the body's x.

The stillness ranking cannot read a still camera's frame. No motion is compensated, and the 24
arrangements fall into three groups of eight by where they put gravity, the signs within each
making no difference. On the ONE RS the eight that put it on the body's x come first, at 3.1
against 4.0 unstabilized, the aligned guess among them; the eight that put it on the body's y, the
right down, come last, at 3.9 to 4.0. `worldMovement` weighs every pixel of the equirectangular
picture alike, the poles beyond their share of the sphere, and a near-still picture turned onto its
side moves less there. On a still camera the stillness ranking therefore prefers a wrong down; the
frames it measured were told apart among arrangements that share a down, or by motion far larger
than the bias.

A still camera's frame is read instead from how level it stands the picture against Insta360
Studio's export of the same recording (`measure/imuFrameLevelling.test.ts`). Studio levels by the
same accelerometer, so under the camera's frame GyroView's horizon mode lies on Studio's. A frame
that puts gravity on a wrong axis leaves a picture no small turn matches, its far field 1.6 to 10
times as different as the best; one that puts gravity on the right axis but turns about it
otherwise reads the small tilt the camera stood at into the wrong body axes, and leaves that tilt
between the two pictures: a camera that stood tilted by an angle leaves the square root of two
times it under a quarter turn about its down and twice it under a half turn. The ranking takes the
frames within a quarter of the best far-field difference whose search met the picture inside its
reach (six degrees of pitch and of roll), by the median tilt they leave over the clip's compared
frames; on a still camera, the frame ranked first decides when it leaves less than half the tilt of
the nearest wrong turn. Where the stillness ranking measured a frame, the levelling ranking puts it
first, alone within that quarter: the X5's on the office and sailing recordings, 0.6 and 1.0
degrees of tilt, the next frame 1.8 and 1.9 times its difference or more; the X6's, 0.9 degrees and
1.7 times; the A1's, 1.4 degrees and twice. Those cameras move, and turned wrong, their motion
leaves no other frame within the quarter: the tilt is checked on the still cameras against the
accelerometer.

- **The X3**, tilted by 2.5 degrees as it stood, so the quarter turns about its down should leave
  3.5 degrees and the half turn 4.9: they leave 3.4 to 3.5 and 4.6 to 4.8, and the X5's arrangement
  0.0 at each of three frames, alike in Chromium and WebKit, which decides it. With it the X3's
  horizon lies on Studio's within 0.2 degrees at all six frames compared. `X3_IMU_FRAME` is the
  X5's arrangement, measured, as the X4 Air's and the X6's are. The camera stood upright on its
  tripod, which its body frame names "on its right side", and now draws upright in every mode (ADR
  0038).
- **The ONE RS**, tilted by 2.6 degrees, standing upright: gravity along the IMU's x puts the
  body's down there. Of the four turns about it, `-y,x,z`, the IMU turned a quarter turn about the
  lens axis, leaves the least tilt in both browsers, 2.3 and 2.4 degrees against 2.9 for the next,
  and its half turn 4.8 and 5.4, near the 5.3 twice the tilt predicts. Every arrangement leaves at
  least 2.3 degrees, more than half the 3.7 a wrong quarter turn would, so the ranking does not
  decide: `ONE_RS_IMU_FRAME` is that arrangement, assumed, and the load still warns. The floor is
  not the calibration strings, whose lens poses agree within 0.15 degrees between v1, v2 and v3.
  This recording draws upright in every mode whichever of the four is right, since the camera never
  turned; a ONE RS recording that turns will rank it. "Insta360 OneRS" names the 360 lens module
  too, assumed alike. Gyroflow's table does not carry over: through the X5's arrangement, its
  entries for the ONE RS and the X3 put their down on another axis than the one measured.
