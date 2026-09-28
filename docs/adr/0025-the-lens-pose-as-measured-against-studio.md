# ADR 0025: The calibration's roll is read mirrored, and yaw and pitch turn the lenses in the body frame

Status: accepted (2026-09-28), measured on a second unit (2026-09-29); amends the lens pose of ADR
0008

## Context

ADR 0008 fixed the lens pose by eye on the first render: lens `i` turns half a turn per index
about the body's lateral axis, then the calibration's yaw, pitch and roll apply in that order.
It left the signs and the order of the small angles as a convention, not a measurement. The
seams of the X5 recordings then showed a vertical step at the side seams and a strip missing
near the nadir and doubled near the zenith, which the roadmap measured on the office recording
as a turn of the back lens of about 1.0 degree about lens 0's axis. The seams themselves could
not settle it: on these recordings near objects own every seam (Phase 1 of the stitching work).

Insta360 Studio's export of the sailing recording is Insta360's own stitch of the same frames.
Under `pnpm measure`, `poseConventions.test.ts` turns GyroView's whole stitch onto a Studio frame
on the far field, then draws each lens alone and finds, for each body axis, the turn of that
lens's pose that registers it on the frame. Under the reading that is the camera's, both lenses
need the same turn; the back lens's turn less the front one's is how far the two poses disagree.
A turn about the lens axis is read on the whole sky band: it moves the picture around the seam
ring, which neither parallax nor an error in the lens's radial shape does. Turns about the other
two axes are read within 35 degrees of each lens's axis, where parallax vanishes. Fifteen frames
spread over the clip; near oblique edges (the mast, the rigging) still spoil a few, so the median
decides and a frame whose search pins at the ±2 degree range is left out for that axis. A turn of
0.5 degrees injected into the back lens's pose moved the measurement by 0.50 to 0.57 degrees.

## Evidence

Median over the frames of the back lens's turn less the front lens's, in degrees about the body
axes (x right, y down, z forward), with the quartiles:

| Reading                                      | About x               | About y                | About z                |
| -------------------------------------------- | --------------------- | ---------------------- | ---------------------- |
| ADR 0008 as it was                           | +1.01 (0.01 to 1.36)  | +1.12 (0.97 to 1.58)   | −1.04 (−1.22 to −0.74) |
| this ADR                                     | +0.17 (−0.24 to 0.55) | −0.16 (−0.46 to −0.06) | −0.14 (−0.24 to 0.02)  |
| this ADR, roll as written                    | +0.07                 | +0.02                  | −0.86                  |
| this ADR, back lens's yaw in the other sense | +0.80                 | +1.09                  | −0.04                  |
| this ADR, pitch mirrored as well             | −0.19                 | −0.20                  | −0.09                  |

The old reading predicted a relative roll of −0.94 degrees under the new one; −1.04 was measured.
On the office recording the new reading turns the back lens by 1.02 degrees about the lens axis
against the old, the turn the roadmap measured there. The turn about x under the old reading had
no sign reading to explain it: it was the yaw error leaking into a search on oblique edges, and it
vanished with the yaw.

## Decision

`lensRotation` applies, from the body into the lens frame:

1. the calibration's yaw about the body's vertical and its pitch about the lateral axis, alike for
   both lenses;
2. the half turn per lens index about the lateral axis that makes the back lens face backwards,
   its sensor upside down relative to the front one (ADR 0008);
3. the roll about the optical axis, mirrored about the sensor's mounting (`mirroredRoll`: the
   quarter turn nearest the value, 90 degrees on the X5, so `89.6` turns as `90.4`).

At nominal angles this is the pose of ADR 0008; only the small angles act differently. With the
half turn first, as before, the back lens's yaw acted about the vertical in the other sense than
the front lens's. The pitch keeps its sign: mirroring it moves no median outside the noise.

## Consequences

- On the sailing recording the relative pose error falls from about 1.8 degrees to about 0.3;
  the rope crossing the seam at 100 s, doubled before, runs through. Near objects still ghost:
  parallax is untouched.
- The front lens's roll changes against the body too, by twice its residual (0.14 degrees on the
  sailing unit, 1.05 on the office unit), which levels the horizon under stabilization by as much.
  That absolute roll is not measured here: the registration sees only the lenses against each
  other.
- The roll is measured on two X5 units against their Studio exports, the yaw and pitch on one. X3
  and X4 strings and their roll mountings are unverified; mirroring about the nearest quarter turn
  keeps any mounting and changes only the residual.
- The pitch sign and the Euler order remain conventions; a reference with far, textured content
  near both lens axes would measure them.

## On a second unit (2026-09-29)

Insta360 Studio's export of the office recording (another X5 unit, 5.7K at 60 fps) joined the
measurement. Cross-correlating the frame-to-frame change of each export and of both lenses showed
that Studio keeps the recording's clock at its own frame rate: the sailing export's frame at `t` is
the recording's frame at `t`, not at `t * 30 / 29.97` as the table above assumed, and the office
export starts 2.98 s into its recording. With the times corrected, the sailing medians are
(+0.02, −0.01, −0.07) degrees about (x, y, z), 13 frames.

On the office unit, 17 frames, the relative turn about the lens axis:

| Reading                                 | About z               |
| --------------------------------------- | --------------------- |
| this ADR                                | +0.09 (−0.31 to 0.31) |
| roll as written                         | +0.88 (0.58 to 1.34)  |
| only the back lens's roll read mirrored | +0.91 (0.60 to 1.19)  |
| ADR 0008 as it was                      | +0.84 (0.52 to 1.14)  |

On the sailing unit the front lens's two readings differ by 0.14 degrees, too little to tell apart;
on the office unit by 1.05, and only the reading of this ADR, both rolls mirrored, registers the
lenses alike. The turns about x and y cannot be read on this clip: the person holding the camera
stands half a metre in front of one lens and a door as near faces the other, within the cones the
two turns are read in, and every reading leaves about (+1.2, −1.5) degrees there, which no reading
of the signs explains.

## Alternatives considered

- The back lens turned about the vertical instead of the lateral axis, outside the angles, as
  omnikit composes its rear lens: the same pose at nominal angles, and it fits the yaw, but it
  leaves the roll as written on the front lens and predicts no roll error on the office unit.
- Refining the back lens's pose per recording from the seam, as omnikit does: on these recordings
  the seam cost is owned by near objects (ADR 0014, the withdrawn refiner of 2026-09-25).
