# ADR 0046: Each row is turned for the time its sensor read it

Status: accepted (2026-10-18), provisional: the row order measured on lens 0 of one ONE R
recording and assumed for lens 1; every other camera turns whole until its row order is measured

## Context

A frame is timed at its middle row (ADR 0034): the rows above and below it were read up to half a
readout before and after, and a fast turn skews them by its rate times that. ADR 0034 left the
correction for later. On a ONE R skydive with the 5.7K 360 lens module, whose info record states a
22.3 ms readout, features tracked frame to frame in three bands of lens 0's rows line up with the
gyro about 11 ms apart between the top band and the bottom one, the top read first; that is about
the 12.9 ms the stated readout gives for the bands' spread. Bands of columns show no such trend:
the sensor reads the coded image's rows. No rotation of the whole frame removes the skew.

## Decisions

- **The rolling shutter** (`rollingShutterFor`) is the info record's `rolling_shutter_time` as the
  readout and a row order, `top-first` or `bottom-first`, chosen by the whole camera model name as
  the IMU frames are, one order for every lens of the camera. A camera without a measured row
  order, or a file that states no readout, is not corrected: a wrong order stills the world less
  than no correction does (Evidence).
- **The corrections** (`rowCorrectionsAt`): nine rotations, for rows at even steps from the first
  row of a lens's window to its last, each taking a direction in the body at the frame's time into
  the body when that row was read, through the orientation track and the mounting. The count is
  odd, so the middle row, at the frame's time, is not turned. Every stabilization mode turns the
  picture at the frame's time, so the corrections apply after the stabilization in any mode.
- **The sink** (`StabilizingFrameSink`) hands them to the renderer before each presentation
  (`PictureRenderer.setRowCorrections`), as it does the stabilization, and none when the
  recording's motion carries no rolling shutter.
- **The shader** (`lensSampling.glsl`): each lens finds the row of its window that images the
  direction at the frame's time, takes the two nearest corrections in proportion, and reads the
  corrected direction. One step is enough: a turn of 500 degrees a second moves a direction by
  up to some 80 rows of a ONE R's lens, at the window's top and bottom, which leaves the row found
  off by about 5 to 6 percent of the correction, some 0.3 degrees there. Each lens is corrected by
  its own rows, so the two sides of the seam each take their own time. The rows run down the
  lens's window on the calibration canvas, as the sensor's do. The raw lens view draws the images
  as decoded, uncorrected.

## Evidence

- `measure/rollingShutterRanking.test.ts` (`pnpm measure`), on the ONE R recording: lock, each
  pair of consecutive frames at five moments, rendered at 1536 by 768. The top-first order at the
  stated readout moves the world by 9.80 against 9.94 uncorrected in Chromium (9.79 against 9.93
  in WebKit); the bottom-first order by 10.15 (10.14). At half the stated readout the top-first
  order gives 9.86, at one and a half times 9.80; the bottom-first order moves the world more the
  longer its readout. Frames half a second apart, as the IMU frame ranking compares, tell the
  candidates apart by under 0.1 percent: in freefall the scene itself changes far more in that
  time than a row's correction moves it.
- Fitted outside the renderer (a scratch analysis with OpenCV, not in the repository): 15 seconds
  of the recording rendered at 1920 by 960 with and without the correction, features tracked
  between consecutive output frames and the rotation between them fitted, both lenses together.
  Under lock the features' median distance from the best rotation of the whole frame falls from
  0.143 to 0.073 degrees, and the fast shake (the rotation less its half-second mean) from 0.090
  to 0.065 degrees (0.340 to 0.239 at the 90th percentile); under horizon the distance falls from
  0.140 to 0.072 degrees. The ranking's 1.4 percent undersells it: a row's correction moves a
  pixel or two of a mostly unchanged picture.
- `ThreeFrameRenderer.test.ts`: corrections all alike turn the picture as a stabilization by the
  same rotation does; corrections that turn only the top rows of a lens's window turn only the
  directions those rows image; no corrections turn every row with its frame again.

## Alternatives considered

- One angular rate a frame instead of a table: a linear model of the turn over the readout, where
  the table follows the orientation track's own interpolation for nine `mat3` uniforms.
- Correcting every camera as reading top first: on a camera that reads the other way the picture
  would move more than with no correction.
- Measuring the readout from the picture at load: the stated readout ranks with the best on the
  one camera measured.

## Consequences

- A ONE R's world stands stiller, as measured under lock and in every mode by construction, most
  at the top and bottom of each lens and in fast turns, where its rows were read furthest from the
  frame's time.
- The ONE R's order rests on one recording of one unit with one lens module, and on lens 0's
  rows: lens 1 is taken to read in the same order, which the whole-picture measures favour but
  cannot show for one lens alone. Its frame's time is taken as its middle row's, as ADR 0034
  measured on the X5 and the X6: the ranking turns the rows about the frame's time, so it cannot
  tell a frame timed elsewhere. Provisional until a recording that can be shared confirms it
  (ADR 0031), ranked one lens at a time, the other silenced through its gain (ADR 0012), and
  timed against the gyro as ADR 0034 timed the X5's.
- Every other camera turns whole until a recording of it ranks its row order: add it to the local
  catalogue (ADR 0031) with the moments it turns at and run `pnpm measure`.
- Each lens projects a direction once more, to find the row it images it in; no texture is read
  twice. Only a recording whose rows are corrected pays for it: for any other the shader returns
  before the projection.
