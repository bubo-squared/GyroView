# ADR 0038: The picture stands as the camera was mounted, a quarter turn read from its gravity

Status: accepted (2026-10-03), the lens-vertical forward measured on one Antigravity A1 recording;
the guessed frames and the cone added after review the same day

## Context

The renderer draws the sphere in the body frame of ADR 0008 (y down, z along lens 0), and a
stabilizer turns it from there. Lock and horizon level the picture from the gyro, but `off`
draws the body as it is and `follow` low-passes the body's own orientation, so both are upright
only when the camera stood with its body's down below it. Most X camera recordings do not: an X3,
X4 Air, X5 or X6 held upright on a stick or a tripod holds its body frame a quarter turn from
upright, gravity along the body's x, as on the X5 sailing recording and two of the three local
samples, and `off` and `follow` showed their world turned a quarter turn. The
Antigravity A1, a drone, carries its lenses one up and one down: its gravity lies along lens 0's
axis, and in `off` its horizon ran top to bottom on every frame.

## Decision

- **A mounting is read from every recording whose IMU frame is measured** (`mountingOf`): the
  quarter or half turn of the body whose down lies nearest the gravity the accelerometer measured
  whenever the camera rested (0.9 to 1.1 g, as the gravity pull takes it), read through the IMU
  frame. A camera that never rests stands upright. Quarter turns only: the picture keeps every
  tilt the camera really took.
- **A guessed IMU frame reads no mounting.** Through a wrong frame, gravity would stand the
  picture on its side or on its head: an X4 standing as the X5's office camera stood, its IMU
  likely arranged as the X5's, would read through the aligned guess as lens 0 down, and `off`,
  the fallback ADR 0009 offers for such a camera, would lose its horizon. Such a camera stands
  upright: every mode draws the body as recorded until its frame is measured.
- **Lens-vertical only within 30 degrees of the lens axis.** Gravity within that cone of lens 0's
  axis stands the camera with lens 0 up or down; outside it, the nearest of the four mountings
  with the lens axis level wins. A drone's lens axis, or a camera's laid flat, lies within a few
  degrees of the vertical; a camera leaning on a stick, even steeply, keeps facing along its lens
  axis.
- **The orientation is integrated for the mounting's upright frame** (`uprightImuFrame`), so the
  opening levels and the world's forward at the start are the camera's as it stood. The
  stabilizers are unchanged; `StabilizingFrameSink` turns their rotation from the upright frame
  into the body (`rotationIntoBody`). `off` therefore draws the camera's motion as recorded,
  upright as it was mounted. Lock and horizon change too, for a camera that did not stand
  upright:
  - Horizon's heading is the twist of the orientation about the vertical. Integrated for the body
    of a camera on its side, a pitch is a twist about the body's y and turned the heading with
    it, by as much as the camera pitched; integrated for the upright frame, it leaves the heading
    alone.
  - Lock and horizon open facing the upright frame's forward: lens 0's direction for a camera
    standing with its lens axis level, as for an upright one, and the body's minus x, a quarter
    turn from lens 0, for a lens-vertical one. ADR 0039 turns the level camera's forward a half
    turn, to where Insta360 Studio centres it.
  - An upright camera's mounting is the identity: every mode draws it as it did, pixel for pixel,
    until ADR 0039 turns its facing.
- **A mounting is named in the body frame**, not by how the camera looks: an X camera upright on
  a stick stands "on its right side", and the X5 office recording, its camera held another way,
  reads "upright".
- **Lens 0 stays forward when gravity lies across its axis.** A camera whose lens axis is the
  vertical faces the body's minus x: Insta360 Studio centres the A1's footage there.

## Evidence

- Gravity in the body frame, the mean of every resting sample: along the body's down on the X5
  office and krnjaca recordings (unchanged by this decision), along its x on the sailing
  recording and two of the local samples (on its right side), along lens 0's axis on the A1
  (lens 0 up). `off` and `follow` are now upright on all of them. The mounting each recording
  takes is pinned in `tools/integration/src/motionOfRealRecordings.test.ts`, the local samples'
  by the catalogue's `mounting`.
- The A1's horizon mode against Studio's export (`measure/studioHorizon.test.ts`), the view turn
  that best puts our panorama on Studio's at eleven frames from standing on the ground to
  flight: without the mounting, Studio's centre lay at our minus 90 degrees, within 2 degrees at
  every moment, so Studio faces one body direction throughout; with it the yaw's median is -0.7
  degrees (quartiles -0.9 and -0.5) and 3.8 at its worst frame, alike in Chromium and WebKit.
- The A1's horizon against Studio's, the same frames: pitch and roll within 1.7 degrees at
  every frame, the range the X5 sailing recording's own alignment to Studio needs (up to 2.2
  degrees of pitch). In flight a drone's accelerometer measures its thrust rather than gravity
  while it holds a speed, and the gravity pull leans the horizon towards it by under a degree
  (ROADMAP, known limits).
- Horizon through a camera on its side while it pitches an eighth of a turn: the view keeps
  facing where the camera faces (`StabilizingFrameSink.test.ts`); integrated for the body, it
  turned 45 degrees to the side.

## Alternatives considered

- **Levelling `off` by the opening's gravity**: it removes the start's tilt, which is the
  camera's real motion and stabilization's business, and a camera picked up after resting on its
  side would stand wrong for the rest of the recording.
- **A mounting per camera model**: the A1's lenses are always vertical, but how an X camera
  stands depends on how it was held or mounted (ADR 0004); the gravity tells both.
- **The least turn for a lens-vertical camera** (its forward the body's down): equally a
  convention, and a quarter turn from where Studio centres the A1.
- **The nearest of all six mountings, without a cone**: a camera leaning more than 45 degrees
  from upright toward a lens axis, on a stick held out steeply, would open facing a quarter or
  half turn from lens 0, and a lean of 44 degrees and one of 46 would open a quarter turn
  apart. The cone keeps that jump for leans no stick gives.
- **Reading the mounting through a guessed IMU frame**: right only where the guess is; elsewhere
  it turns `off`, the guessed frame's fallback, on its side.

## Consequences

- Every recording whose body frame stood on its side, upside down or on its lens axis, and whose
  IMU frame is measured, draws `off` and `follow` upright: for an X camera on a stick or a
  tripod, that is its usual pose. The others draw as before. Lock-mode measurements
  made with the player's orientations go through the mounting too (`lockAt` in
  `tools/integration`).
- Horizon holds its heading while such a camera pitches, and lock and horizon open facing the
  upright frame's forward: a page that set a `yaw` to face a direction may see it moved by a
  quarter or half turn on a lens-vertical recording.
- A camera without a measured IMU frame (the X4, the ONE series) draws every mode as its body
  stood; measuring its frame (ADR 0009) gives it its mounting too, as it gave the X3's.
- A camera turned over in the middle of a recording takes the mounting of the way it stood
  longest at rest.
- The cone's 30 degrees is a judgement, not a measurement: a camera laid on a slope steeper than
  that stands lens-level, on its side as the slope tilts it.
- The lens-vertical forward rests on one camera's Studio export; a lens-vertical X camera on a
  drone faces wherever its mount put the body's minus x.
