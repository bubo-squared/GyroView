# ADR 0046: Each row is turned for the time its sensor read it

Status: accepted (2026-10-18), the row order measured on one ONE R recording; every other camera
turns whole until its row order is measured

## Context

A frame is timed at its middle row (ADR 0034): the rows above and below it were read up to half a
readout before and after, and a fast turn skews them by its rate times that. ADR 0034 left the
correction for later. On a ONE R skydive with the 5.7K 360 lens module, whose info record states a
22.3 ms readout, features tracked frame to frame in three bands of each lens's rows line up with
the gyro about 11 ms apart between the top band and the bottom one, the top read first, in both
lenses; that is about the 12.9 ms the stated readout gives for the bands' spread. Bands of columns
show no such trend: the sensor reads the coded image's rows. No rotation of the whole frame
removes the skew.

## Decisions

- **The rolling shutter** (`rollingShutterFor`) is the info record's `rolling_shutter_time` as the
  readout and a row order, `top-first` or `bottom-first`, chosen by the whole camera model name as
  the IMU frames are. A camera without a measured row order, or a file that states no readout, is
  not corrected: a wrong order stills the world less than no correction does (Evidence).
- **The corrections** (`rowCorrectionsAt`): nine rotations, for rows at even steps from the first
  row of a lens's window to its last, each taking a direction in the body at the frame's time into
  the body when that row was read, through the orientation track and the mounting. The count is
  odd, so the middle row, at the frame's time, is not turned. Every stabilization mode turns the
  picture at the frame's time, so the corrections apply after the stabilization in any mode.
- **The sink** (`StabilizingFrameSink`) hands them to the renderer before each presentation
  (`PictureRenderer.setRowCorrections`) when the recording's motion carries a rolling shutter.
- **The shader** (`lensSampling.glsl`): each lens finds the row of its window that images the
  direction at the frame's time, takes the two nearest corrections in proportion, and reads the
  corrected direction. One step is enough: a correction moves a direction by a few rows at most.
  Each lens is corrected by its own rows, so the two sides of the seam each take their own time.
  The rows run down the lens's window on the calibration canvas, as the sensor's do. The raw lens
  view draws the images as decoded, uncorrected.

## Evidence

- `measure/rollingShutterRanking.test.ts` (`pnpm measure`), on the ONE R recording: lock, each
  pair of consecutive frames at five moments, rendered at 1536 by 768. The top-first order at the
  stated readout moves the world by 9.80 against 9.94 uncorrected in Chromium (9.79 against 9.93
  in WebKit); the bottom-first order by 10.15 (10.14). At half the stated readout the top-first
  order gives 9.86, at one and a half times 9.80; the bottom-first order moves the world more the
  longer its readout. Frames half a second apart, as the IMU frame ranking compares, tell the
  candidates apart by under 0.1 percent: in freefall the scene itself changes far more in that
  time than a row's correction moves it.
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
- Every other camera turns whole until a recording of it ranks its row order: add it to the local
  catalogue (ADR 0031) with the moments it turns at and run `pnpm measure`.
- Each lens projects a direction once more a pixel to find its row; no texture is read twice.
