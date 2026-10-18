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
- **The smoothing** (`SmoothedHeading`): the heading (the swing-twist twist about the vertical, as
  horizon reads it) sampled on a 10 ms grid over the track, unwrapped where it crosses a half turn,
  and smoothed by a Gaussian of a one-second standard deviation cut off at three. Near the ends of
  the track the weights left are taken in proportion. A frame faces the smoothed heading at its
  time, interpolated on the grid.
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

## Alternatives considered

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
