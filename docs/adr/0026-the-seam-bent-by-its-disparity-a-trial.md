# ADR 0026: The seam bent by the disparity measured across it, a trial

Status: trial (2026-09-29): the bent join passes on picture quality and fails on the cost of its
measurement; the player keeps the fixed join

## Context

With the lens pose measured (ADR 0025), what shows at the seams of the X5 recordings is the
parallax of near objects. The lenses sit on one axis 3.2 cm apart, so a near object's two images
differ only across the seam ring, never along it: about 0.9 degrees at 2 m, 1.8 at 1 m, and more
than the lenses' shared overlap within arm's reach. A rigid correction cannot align two depths at
once (the withdrawn refiner of 2026-09-25). A local one can: per azimuth, move each lens's image
across the ring by half the disparity measured there, as Insta360 Studio's dynamic stitching
does. A feature detector is not needed: the disparity is one number per azimuth bin, found by
sliding one lens's sampling across the ring on the GPU.

## Method

Under `pnpm measure`, `seamJoins.test.ts` on every Studio frame of both clips (13 sailing frames,
17 office frames):

- the mismatch meter slides lens 0's sampling across the ring from −4 to +10 degrees in quarter
  degrees (`seamDisparity.ts`); a bin's disparity is trusted where its costs contrast and their
  minimum lies well inside the range; `seamDisparityField.ts` smooths the trusted bins around the
  ring, pulls toward zero where none is trusted and stays flat under the camera;
- three joins (`seamJoin.ts`, `seamJoin.glsl`): `fixed`, the template as the player draws it;
  `bent`, each lens read across the ring by half the disparity, up to 4 degrees apart, weighed
  where it is read, the rest cut; `cut`, the template with the blend narrowed where the disparity
  is large;
- per seam bin, within 6 degrees of the ring: the difference of each join to Studio's frame, and
  for the fixed and bent joins the difference between the two lenses drawn alone, the double
  image a blend makes of them; the change of the fixed join's difference to Studio from the frame
  to the next is the measurement's noise;
- on 16 consecutive frames drawn in the body frame, each frame's field eased from the one before
  as a player would: each join's mean change from frame to frame in the band, and its draw time.

## Evidence

Mean level difference (0–255) per bin, by how far the field bends the bin:

| Sailing, bend  | Bins | Lenses, fixed → bent | To Studio, fixed / bent / cut | Noise |
| -------------- | ---- | -------------------- | ----------------------------- | ----- |
| 1 to 4° (near) | 188  | 32.1 → 19.2 (−40%)   | 27.2 / 25.6 / 27.9            | 2.7   |
| 4° or more     | 30   | 37.5 → 25.2 (−33%)   | 27.2 / 25.5 / 27.4            | 3.1   |
| −1° or less    | 61   | 9.7 → 9.7            | 10.2 / 10.0 / 10.3            | 0.5   |
| under 0.25°    | 190  | 14.1 → 14.0          | 12.0 / 12.1 / 12.1            | 0.7   |

| Office, bend   | Bins | Lenses, fixed → bent | To Studio, fixed / bent / cut | Noise |
| -------------- | ---- | -------------------- | ----------------------------- | ----- |
| 1 to 4° (near) | 30   | 39.5 → 35.0 (−11%)   | 21.6 / 24.5 / 21.4            | 1.2   |
| 4° or more     | 26   | 28.7 → 23.1 (−20%)   | 20.9 / 25.1 / 21.3            | 1.0   |
| −1° or less    | 638  | 16.5 → 9.3 (−44%)    | 14.9 / 14.8 / 15.1            | 0.6   |
| under 0.25°    | 158  | 13.4 → 13.4          | 9.6 / 9.6 / 9.6               | 0.4   |

- Seen side by side with Studio's frames, the bent join draws single what the fixed join doubles:
  the sailing bow's rope and rail at 1 m, the person half a metre from the office camera, the
  office cabinet's edges. Within arm's reach (legs on the sailing deck) it still ghosts: the
  disparity exceeds what the overlap can bend. A straight edge crossing the seam where the bend is
  large curves slightly. The cut join trades the double image for a visible step, and against
  Studio it is no better than the fixed join, within the noise.
- Against Studio the bent join is slightly closer on sailing's near bins, within the noise, and
  farther on office's, where the bent join draws the person single but not where Studio draws
  them: for near objects Studio is a reference, not the truth.
- The office recording's far and mid bins read −1.5 to −3.5 degrees. Parallax never makes a
  disparity negative, so that is the lens model's error at the seam on that unit, 1.5 degrees per
  lens (ADR 0023, on a second unit); bending takes it up, hence the 44 percent.
- Frame-to-frame change in the band: sailing 4.49 fixed, 4.62 bent, 4.56 cut; office 4.57, 4.61,
  4.78, within 3 percent. Draw time at 1536×768: sailing 4.65, 4.82, 4.76 ms; office 2.68, 2.82,
  2.76 ms.
- One measurement of the field, read-back included, takes 25 to 35 ms on an M4 Pro (57 candidates,
  25 sub-samples a cell); with 4 sub-samples a cell, 10 ms and the same field (median difference
  0.01 degrees).

## Decision

The trial's criteria, set before it ran: the lenses' disagreement on near bins well beyond the
noise, on both clips (met); far bins within the noise (met); no more frame-to-frame change than
the fixed join (within 3 percent); no tear or bent straight line the fixed join does not show
(no tear; slight curves where the bend is large); one measurement under a millisecond (not met, by
ten times at best).

The bent join stays in the renderer, and its measurement in the core, for a player-side trial once
the measurement is cheap enough; the player draws the fixed join. The cut join is dropped: it
trades one artefact for another.

## Consequences

- The player's picture is unchanged.
- Before the player measures the field, the measurement needs to be about ten times cheaper: fewer
  sub-samples (four already keep the field), a coarse-to-fine slide, only the rows near the ring,
  and a measurement every few frames rather than every frame, its read-back never waited on.
- The largest single gain on the office unit is the lens model's error at the seam, which one
  measurement per recording can correct without bending anything (ADR 0023).
- Near objects within arm's reach stay doubled: no bend within the overlap reaches them.

## Alternatives considered

- Sparse features (omnikit's XFeat, ORB) matched across the lenses: a runtime and a model to ship,
  tens of milliseconds a frame, and points where the seam needs a value at every azimuth.
- A rigid refinement of the back lens per recording, as omnikit does: aligns one depth at a time;
  the near objects own the seam's cost (the withdrawn refiner).
