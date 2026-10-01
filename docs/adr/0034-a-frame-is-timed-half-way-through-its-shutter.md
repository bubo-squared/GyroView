# ADR 0034: A frame's gyro time is half way through its shutter, with nothing added for the readout

Status: accepted (2026-10-01), measured on one of our own X5 recordings and one privately shared
X6 recording; X3 and X4 unmeasured

## Context

Stabilization turns each frame by the camera's orientation at one instant, the frame's
mid-exposure time (ADR 0009). The player took it as the exposure record's capture time plus half
the shutter plus half the rolling-shutter readout (info field `rolling_shutter_time`), an
assumption no measurement had checked. On the X6, whose lenses read out over a large part of
each frame, the stabilized world swayed: in lock mode its far field moved half a degree to and
fro as the camera swung, where Insta360 Studio's export of the same clip stands still.

## Evidence

`tools/integration/src/measure/gyroTiming.test.ts` draws a recording under lock with the gyro
sampled from 20 ms before to 20 ms after each frame's time, in 2 ms steps, and scores how much
the world moves between two frames fifteen apart, over a band of the panorama as wide above the
horizon as below it. It measures at the 16 moments where the camera's turn rate changes most
between the two frames, which is where a timing error moves the world, takes each moment's
minimum, and reports their mean and standard error against the frame's time as the player now
takes it:

| Recording                        | Chromium      | WebKit        |
| -------------------------------- | ------------- | ------------- |
| X6, one recording (ADR 0031)     | −0.4 ± 1.0 ms | −0.4 ± 0.9 ms |
| X5 sailing, 8K30, shot at 1/50 s | +0.4 ± 2.6 ms | −0.3 ± 2.8 ms |
| X5 office, 5.7K60                | +2.7 ± 3.7 ms | +2.6 ± 3.7 ms |
| X5 krnjaca, 8K30                 | −11 ± 4 ms    | −11 ± 4 ms    |

The office and krnjaca recordings change their turn too little for their moments to agree (a
standard error above 3 ms), and the measurement skips them. On the two that tell, the minimum
lies at the frame's time within the grid; the old rule put the gyro half a readout late, 10.6 ms
on the sailing recording and a larger part of a frame's interval on the X6.

**The shutter half.** Gyroflow times an Insta360 frame's middle row at the exposure entry minus
half the shutter minus 0.9 ms ("a mystery", its comment says); this rule adds half the shutter.
The two differ by a shutter and 0.9 ms. On the sailing recording, shot at 1/50 s, that is 20.9
ms, eight of its standard errors: its minimum sits where half the shutter is added. Gyroflow's
per-row model times a frame at its middle row, as this rule does, so the readout is not added in
either.

**The sway.** `tools/integration/src/measure/farFieldSway.test.ts` draws 420 consecutive frames
under lock and follows the far field's horizontal position from frame to frame. The X6's far
field sways 0.034 degrees rms faster than about 3 Hz, its frame-to-frame step 0.061 degrees at
the 95th percentile. A one-off run of the same method gave 0.137 and 0.267 with the half readout
added, and 0.032 and 0.062 without it.

## Decision

- A frame's gyro time is its capture time plus half its shutter. The capture time is the
  exposure start of the frame's middle row: half the readout lies before it and half after, so
  nothing is added for the readout. One rule for every camera, as Gyroflow has one for every
  Insta360 camera.
- The gyro offset (info field 28) applies only where field 29 says the camera measured one, as
  telemetry-parser reads them. Every recording measured here sets it.
- `RecordingInfo.readoutTime` is still read: it is public (`inspectRecording`), insv-inspect
  shows it, and it is what a correction of each row by its own time would need.
- The measurements stay, checking any camera's timing: a recording whose moments agree to 3 ms
  must have the frame's time within two standard errors of their minimum, or within the grid.

## Alternatives considered

- An offset for the X6 alone: the model string would choose a timing no field of the file
  states, and the X5's sailing recording is better timed without the readout term too.
- Measuring the offset at load from the picture, as Gyroflow does: the measurement needs frames
  decoded and drawn several times; one rule that fits the recordings is enough for now.
- Turning each row by its own time (a rolling-shutter correction): the right answer for the
  readout's skew within a frame, a larger change; the frame's time stays the middle row's.

## Consequences

- The X6 holds still under lock and horizon; the X5's stabilized pictures move by the half
  readout the old rule added (4 ms at 5.7K60, 10.6 ms at 8K30), toward the time the sailing
  recording measures. The measurement renders the X5 baseline compares sample the gyro at the
  track's timestamps, not through the frame times, and do not show the change.
- Rows near the top and bottom of a lens's image were exposed up to half a readout before or
  after its middle row: a fast turn still skews them by its rate times that, about a degree at
  100 degrees a second on the X5 at 8K30, and where a lens's rows run across the seam the two
  lenses can differ there by up to a whole readout. A per-row correction would remove it.
