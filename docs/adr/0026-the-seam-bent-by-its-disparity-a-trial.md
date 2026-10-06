# ADR 0026: The seam bent by the disparity measured across it, a trial

Status: trial (2026-09-29): the bent join removes most of the double image where it can bend and
the lens model's error at the seam, but its measurement costs ten times too much; the player keeps
the fixed join

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

- the mismatch meter slides lens 0's sampling across the ring from −6 to +10 degrees in quarter
  degrees (`seamDisparity.ts`); a bin's disparity is trusted where its costs contrast and their
  minimum lies well inside the range; `seamDisparityField.ts` smooths the trusted bins around the
  ring, pulls toward zero where none is trusted and stays flat under the camera;
- the joins (the lab's `bentJoin.glsl` and `seamJoin.ts`): `fixed`, the template as the player
  draws it; `bent`, each lens read across the ring by half the disparity, up to 4 degrees apart,
  weighed where it is read, the rest cut; and, in the run before it was dropped, `cut`, the
  template with the blend narrowed where the disparity is large;
- per seam bin, within 6 degrees of the ring: the difference of each join to Studio's frame, and
  for the fixed and bent joins the difference between the two lenses drawn alone, the double
  image a blend makes of them, over the pixels both lenses show under both joins; the change of
  the fixed join's difference to Studio from the frame to the next is the measurement's noise;
- on 16 consecutive frames drawn in the body frame, each frame's field eased from the one before
  as a player would: each join's mean change from frame to frame in the band, and its draw time.

## Evidence

Mean level difference (0–255) per bin, by how far the field bends the bin:

| Sailing, bend  | Bins | Lenses, fixed → bent | To Studio, fixed / bent | Noise |
| -------------- | ---- | -------------------- | ----------------------- | ----- |
| 1 to 4° (near) | 180  | 32.1 → 19.3 (−40%)   | 27.3 / 25.6             | 2.6   |
| 4° or more     | 31   | 33.7 → 25.7 (−24%)   | 27.0 / 25.1             | 3.1   |
| −1° or less    | 92   | 8.2 → 7.5 (−8%)      | 9.8 / 9.7               | 0.4   |
| 0.25 to 1°     | 295  | 13.4 → 11.2 (−16%)   | 15.1 / 15.0             | 1.3   |
| under 0.25°    | 182  | 14.6 → 14.5          | 12.4 / 12.5             | 0.8   |

| Office, bend   | Bins | Lenses, fixed → bent | To Studio, fixed / bent | Noise |
| -------------- | ---- | -------------------- | ----------------------- | ----- |
| 1 to 4° (near) | 24   | 35.4 → 33.4 (−5%)    | 20.7 / 23.3             | 1.4   |
| 4° or more     | 22   | 24.5 → 22.1 (−10%)   | 21.1 / 25.9             | 1.1   |
| −1° or less    | 733  | 16.1 → 8.7 (−46%)    | 14.4 / 14.4             | 0.6   |
| 0.25 to 1°     | 119  | 13.8 → 12.7 (−8%)    | 13.6 / 13.6             | 0.7   |
| under 0.25°    | 122  | 13.9 → 13.9          | 9.3 / 9.3               | 0.4   |

The cut join, measured in a run before it was dropped, came within the noise of the fixed join
against Studio in every row (sailing 27.9 and 27.4 on the near rows against 27.2).

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
  lens (ADR 0023, on a second unit); bending takes it up, hence the 46 percent. On that unit the
  error and a near object's parallax add up: the person half a metre away, about +3 degrees of
  parallax over −2.5 of error, reads near +0.7 and falls among the 0.25 to 1 degree bins, and the
  office's near rows hold mostly what lies within arm's reach, beyond what a bend takes.
- Frame-to-frame change in the band: sailing 4.49 fixed, 4.62 bent; office 4.57, 4.61: the bent
  join within 3 percent of the fixed one. Draw time at 1536×768: sailing 4.58 fixed, 4.85 bent;
  office 2.72, 2.78 ms, within 6 percent.
- Some bins find their least cost at the negative end of the range however wide it is: with the
  range ending at −4 degrees, 253 of the office's textured bins sat there; ending at −6, 100 of
  them found a minimum between, and 153 sat at the new end (89 on sailing). That is not a
  disparity, and those bins stay untrusted.
- One measurement of the field, read-back included, takes 25 to 40 ms on an M4 Pro (65 slides,
  25 sub-samples a cell); with 4 sub-samples a cell, about 10 ms and the same field (median
  difference 0.01 degrees).

## Decision

The trial's criteria, set before it ran:

- the lenses' disagreement on near bins well beyond the noise, on both clips: met on sailing
  (12.8 levels against 2.6), not on office's near rows (2.0 against 1.4), whose visible gain on
  the person sits in the 0.25 to 1 degree bins and whose largest gain is the lens model's error;
- far bins within the noise: met on both;
- no more frame-to-frame change than the fixed join: the bent join within 3 percent;
- no tear or bent straight line the fixed join does not show: no tear; slight curves where the
  bend is large;
- one measurement under a millisecond: not met, by ten times at best.

The bent join stays in the lab renderer, and its measurement's domain in the core, for a
player-side trial once the measurement is cheap enough; the player draws the fixed join. The cut
join is dropped: it trades one artefact for another.

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

## Since ADR 0038 (2026-10-05)

The arc the field keeps flat under the camera (`NADIR_ARC`, body azimuths 60 to 120 degrees) is
body +y: the nadir of a camera standing upright. An X camera held upright on a stick reads "on its
right side" (ADR 0038), its down along body +x, at azimuth 0. On such a recording the arc lies
over a level sector of the scene, while the stick and whatever is below it are bent and counted
as trusted bins; some of the doubling left near the deck in the evidence above may be this. A
player-side trial takes the arc from the mounting (world down in the body, at azimuth
`atan2(y, x)`), keeps none for a lens-vertical mounting, and lets an arc wrap through zero.
