# ADR 0038: The picture stands as the camera was mounted, a quarter turn read from its gravity

Status: accepted (2026-10-03), the lens-vertical forward measured on one Antigravity A1 recording

## Context

The renderer draws the sphere in the body frame of ADR 0008 (y down, z along lens 0), and a
stabilizer turns it from there. Lock and horizon level the picture from the gyro, but `off`
draws the body as it is and `follow` low-passes the body's own orientation, so both are upright
only when the camera stood with its body's down below it. Many recordings did not: on the X5
sailing recording and on two of the three local samples the camera stood on its side (gravity
along the body's x), and `off` and `follow` showed their world turned a quarter turn. The
Antigravity A1, a drone, carries its lenses one up and one down: its gravity lies along lens 0's
axis, and in `off` its horizon ran top to bottom on every frame.

## Decision

- **A mounting is read from every recording with a gyro record** (`mountingOf`): the quarter or
  half turn of the body, among the six that put one body axis along gravity, whose down lies
  nearest the gravity the accelerometer measured whenever the camera rested (0.9 to 1.1 g, as
  the gravity pull takes it), read through the IMU frame. A camera that never rests stands
  upright. Quarter turns only: the picture keeps every tilt the camera really took.
- **The orientation is integrated for the mounting's upright frame** (`uprightImuFrame`), so the
  opening levels and the world's forward at the start are the camera's as it stood. The
  stabilizers are unchanged; `StabilizingFrameSink` turns their rotation from the upright frame
  into the body. `off` therefore draws the camera's motion as recorded, upright as it was
  mounted; lock and horizon are unchanged but for a heading at the start that can differ by the
  tilt of the opening.
- **Lens 0 stays forward when gravity lies across its axis.** A camera whose lens axis is the
  vertical faces the body's minus x: Insta360 Studio centres the A1's footage there.

## Evidence

- Gravity in the body frame, the mean of every resting sample: along the body's down on the X5
  office and krnjaca recordings (unchanged by this decision), along its x on the sailing
  recording and two of the local samples, along lens 0's axis on the A1. `off` and `follow` are
  now upright on all of them.
- The A1's horizon mode against Studio's export at six moments, from standing on the ground to
  flight, by the yaw that best correlates the panoramas' gradients: before, Studio's centre lay at
  our minus 90 degrees, within 2 degrees at every moment, so Studio faces one body direction
  throughout; with this decision it lies within 0.7 degrees at five moments and 3.5 at the sixth.
- The A1's horizon against Studio's: 1.1 to 1.3 degrees of tilt on the ground and 1.3 to 2.5 in
  flight, the range the X5 sailing recording's own alignment to Studio needs (up to 2.2 degrees
  of pitch). Without the gravity pull the flight's figure falls to 1.0 to 1.9 degrees: a drone's
  accelerometer measures its thrust rather than gravity while it holds a speed, and the pull
  leans the horizon towards it by under a degree (ROADMAP, known limits).

## Alternatives considered

- **Levelling `off` by the opening's gravity**: it removes the start's tilt, which is the
  camera's real motion and stabilization's business, and a camera picked up after resting on its
  side would stand wrong for the rest of the recording.
- **A mounting per camera model**: the A1's lenses are always vertical, but how an X camera
  stands depends on how it was held or mounted (ADR 0004); the gravity tells both.
- **The least turn for a lens-vertical camera** (its forward the body's down): equally a
  convention, and a quarter turn from where Studio centres the A1.

## Consequences

- Every recording whose camera stood on its side or on its lens axis draws `off` and `follow`
  upright; the others draw as before. Lock-mode measurements made with the player's
  orientations go through the mounting too (`lockAt` in `tools/integration`).
- A camera turned over in the middle of a recording takes the mounting of the way it stood
  longest at rest.
- The lens-vertical forward rests on one camera's Studio export; a lens-vertical X camera on a
  drone faces wherever its mount put the body's minus x.
