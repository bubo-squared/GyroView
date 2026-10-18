# ADR 0047: The smooth mode keeps the horizon level and looks ahead for its heading

Status: accepted (2026-10-18)

## Context

Horizon (ADR 0009) removes roll and pitch but takes the camera's heading as it is, so the shake of
a head or a hand in that heading stays in the picture. Follow smooths it, but only from frames
already shown: a first-order low pass with a 1.5 s time constant, which trails every turn by about
that long and leaves the camera's roll in. A player that has integrated the whole orientation track
when it opens (`OrientationTrack.integrate`) knows every heading the recording will take, before
and after the frame on screen.

## Decisions

- **A fifth mode, `smooth`:** the horizon level as horizon has it, the view facing the camera's
  heading smoothed both ways in time. Horizon and follow are unchanged.
- **The smoothing** (`SmoothedHeading`): the heading horizon reads, the swing-twist twist about
  the vertical, taken as its vector `(m13 - m31, m11 + m33)` of the orientation's matrix rather
  than as an angle, on a 10 ms grid over the track, and smoothed component by component by a
  Gaussian of a one-second standard deviation cut off at three. The vector's length, twice the
  cosine of half the camera's tilt from upright, is how well the twist is defined, so moments the
  camera tumbles near upside down weigh little and nothing has to be unwrapped. Near the ends of
  the track the weights left are taken in proportion. A frame faces the direction of the smoothed
  vector at its time, interpolated on the grid.
- **Built once:** the strategy is stateless, its heading smoothed when it is built.
  `stabilizerFor(mode, orientations)` takes the track for this mode, and
  `StabilizingFrameSink.setStabilizationMode` builds a mode over the recording's own track; without
  a track the smooth mode is horizon.

## Evidence

- `stabilizers.test.ts`: on a synthetic turn of a quarter turn a second, through half turns, the
  smooth mode faces where horizon does in the middle of the track, within a thousandth of a
  radian: no lag. With five degrees of heading shake at four hertz, it lies within two thousandths
  of a radian of lock, where horizon lies over 0.08 away. On a camera that rolls as it turns, the
  view's up is horizon's.

- On the ONE R skydive of ADR 0009, from 30 s to 45 s: the camera's tilt from upright reaches 80
  to 110 degrees in freefall, and its twist jumps by up to 70 degrees between frames. Smoothed as
  vectors, the heading turns 0.83 degrees a frame at the median, 1.65 at the 90th percentile and
  2.5 at most; unwrapped as an angle, it followed the jumps' extra turns, 3.3 at the 90th
  percentile. Rendered and tracked frame to frame, the picture's fast rotation under smooth is
  0.073 degrees a frame, against 0.065 under lock and 0.46 under horizon; its whole rotation 1.56
  degrees a frame at the 90th percentile, against 3.20 under horizon.
- `stabilizers.test.ts`: a camera that tumbles to 179.5 degrees and rolls a whole turn about its
  lens axis while it turns keeps its view turning at the turn's rate; unwrapped, the angle spun.

## Alternatives considered

- Unwrapping the heading as an angle and smoothing that: where the twist swings by up to a half
  turn between samples, the unwrapping takes a whole turn at random and the smoothing spreads it
  over seconds.

- Smoothing horizon's heading in place: one mode fewer, but a page that chose horizon for a heading
  that follows the camera exactly would get another picture.
- Follow's low pass with a level horizon: still a second behind every turn.
- A Kalman smoother over the full orientation: the heading alone is what shakes once the horizon is
  level, and a Gaussian over it has nothing to tune but its spread.

## Consequences

- A recording's view follows its turns smoothly and on time, the horizon level, at no cost per
  frame: building the strategy smooths about a hundred samples a second of track once.
- The heading is undefined where the camera turns half over about a horizontal axis; the smoothing
  averages through such a moment as through any other.
