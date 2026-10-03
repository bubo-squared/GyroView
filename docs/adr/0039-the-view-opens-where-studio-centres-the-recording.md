# ADR 0039: The view opens where Insta360 Studio centres the recording

Status: accepted (2026-10-03)

## Context

The body frame of ADR 0008 has z along lens 0, and the view opened along it: `yaw` 0 looked out
of lens 0. Insta360 Studio opens its exports facing the other way. The view turn that best puts
GyroView's horizon on each Studio frame (`measure/studioHorizon.test.ts`) was a steady half turn
on every camera whose lens axis lies level and whose export follows the camera's heading: a
median of 180.0 degrees on the X3, -177.2 on the X6 and 180.2 on the ONE RS, alike in Chromium
and WebKit. The X5 sailing export, its direction locked, opens at -168.8. Only the A1, a drone
whose lens axis is the vertical, opened where Studio does, since ADR 0038 centred it there. A
viewer opening the same recording in Studio and in a page saw opposite sides of it first.

## Decision

- **The upright frame faces where Studio centres the recording.** A mounting whose lens axis lies
  level turns the upright frame a half turn about the vertical from lens 0 before standing it as
  the camera stood (`lensLevel` in `Mounting.ts`); a lens-vertical mounting keeps the body's
  minus x (ADR 0038). Both families follow one rule: the forward is Studio's.
- **A recording whose gravity cannot be read faces the same way.** One with a guessed IMU frame
  stands by `UPRIGHT_MOUNTING`, and one without a gyro record is drawn through it as well.
- **The body frame stays as ADR 0008 has it.** The lens poses, the seam, the calibration and every
  measurement keep z along lens 0; only where the view starts moves. `yaw` 0 looks where Studio's
  export is centred, in every mode and in the equirectangular panorama.

## Evidence

The same measurement after the change: a median yaw of 0.0 degrees on the X3, 0.7 on the X6 and
0.2 on the ONE RS, and -0.7 on the A1, which did not move; the X5 sailing export's first frame
lies at 11.2, its locked direction drifting from there with the boat's turns. The tilts are
unchanged.

## Alternatives considered

- **A facing per camera model**: every camera measured against an export that follows its heading
  showed the same half turn; one rule needs no table to keep.
- **Turning the body frame, z along lens 1**: every lens pose, the calibration's reading and the
  measurements built on ADR 0008 would move for a change of where the view starts.
- **Opening the view at `yaw` 180**: `yaw` 0 would still look away from where Studio looks, and the
  lens-vertical cameras would follow another rule.

## Consequences

- On a camera whose lens axis lies level, every page's opening view turns a half turn; a page that
  set `yaw` to face a direction faces the opposite one until it adds 180 degrees. The A1 opens as
  before.
- Measurements against Studio read a yaw near zero where they read a half turn.
- The X4 and X4 Air have no Studio export here; they follow the rule unmeasured.
