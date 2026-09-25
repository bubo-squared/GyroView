# ADR 0014: The encoded frame shows the whole calibration square

Status: accepted (2026-09-25); supersedes the canvas-window decision of ADR 0008

## Context

ADR 0008 mapped each lens frame onto the info record's sensor window: 5312 of 5376 sensor
pixels at offset 0 on the X5, so a frame pixel `u` was taken to sit at canvas `u * 5312`
rather than `u * 5376`, and the calibration's principal point landed 17 frame pixels (at 2880) right of and below where the whole square would put it. The evidence was that the
frames are lit to their edges, which a whole square with a 100-degree image circle of radius
2664 would not be.

Two defects were visible at the seams on the X5 recordings: a small vertical offset between
the lenses at the side seams, and a strip of the scene missing (and doubled on the opposite
side) where the seam ring crosses the nadir and zenith. Both are the signature of a constant
shift of each lens image in its own image plane, which the facing of the back lens turns into
opposite shifts in the world.

## Decision

The frame shows the whole calibration square: frame pixel `u` sits at canvas `u * side`, with
the square chosen by the principal point as before. The info record's window crop is parsed
and reported but not applied to the mapping.

## Evidence

The fisheye image circle, the rim where the black corners of a frame begin, is a property of
the lens, not of the scene, and its centre is the optical axis. `imageCircleOf` in
`tools/integration/src/browser/imageCircle.ts` fits it to the corners of a decoded frame,
walking each ray inwards from the black corner and trimming outliers; the stitch test in
`realRecordingStitch.test.ts` keeps the measurement as a regression check. Distance from the
fitted centre to where the principal point lands under each reading, in frame pixels:

| Frame                     | Whole square | Sensor window at offset 0 |
| ------------------------- | ------------ | ------------------------- |
| office 5.7K, lens 0, 20 s | 4.7          | 27.8                      |
| office 5.7K, lens 1, 20 s | 18.5         | 40.4                      |
| office LRV, lens 0        | 3.2          | 4.7                       |
| office LRV, lens 1        | 2.7          | 8.6                       |
| sailing 8K, lens 1, 20 s  | 12.0         | 29.2                      |
| sailing 8K, lens 0, 150 s | 16.0         | 23.4                      |

Twelve measurements over three recordings and several times all favour the whole square. The
lit-to-the-edge observation of ADR 0008 is explained by the measured image circle: its
radius is about 2780 canvas pixels, beyond the 2688 half side, so only the corners are black.
Side by side renders of the office frame confirm it: with the whole square the doubled arm at
the right seam, the broken plank lines and the half-missing blanket fringe at the nadir line
up, while the parallax ghost of the door handle a metre away stays, as it must.

## What stays open

The whole square and a 5312 window centred in it put the principal point at the same place
and differ only by a 1.2 % scale. At the seam that is about two degrees of relative shift, not
half a degree: a scale error `s` moves each lens's content by `s * r / (dr/dtheta)`, about
1.57 radians per unit of scale at the rim of these lenses, and the two lenses move in opposite
directions. The image circle cannot tell the two readings apart and the seam registration on
these recordings is dominated by parallax. The whole square is the reading with fewer assumptions and is kept until a
recording whose window record differs from the X5's, or an Insta360 Studio export, decides it.
The semantics of the window record for other cameras and modes remain unknown.

## Alternatives considered

- A centred 5312 window: same centre, 1.2 % smaller scale, and it contradicts the record's
  explicit zero offsets as much as ignoring them does.
- Keeping the window and correcting the offsets only when they are zero: a rule fitted to one
  camera's record.
