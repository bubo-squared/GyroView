# ADR 0023: The legacy radius spans 96 degrees, and the legacy string is the default reading

Status: accepted (2026-09-28); supersedes the v1 reading and the model preference of ADR 0005,
and closes the scale question of ADR 0014. Contradicted on a second unit (2026-09-29): the angle
and the model are open again

## Context

ADR 0005 read the legacy `offset` string's radius as the radius 100 degrees from the lens axis,
because the Mei model of the `offset_v3` string reaches that radius exactly there on both X5
lenses, and stitched through the Mei model as the most accurate. The seams then doubled far
content, and ADR 0014 left a scale question of about a percent open, measured on seams that the
parallax of near objects confounds. omnikit reads the same radius as spanning 95 degrees
(`fov_deg = 190`), and its stitch looked right where GyroView's did not.

Insta360 Studio's export of the sailing recording is an external reference: Insta360's own stitch
of the same frames. Under `pnpm measure`, `referenceComparison.test.ts` (removed once this was
settled) turns GyroView's panorama of a frame, under the gyro's lock, to match the export on the
far-field rows (sky, horizon, coast) and scores what remains; `lensReadings.test.ts` does so for
each reading of the strings and a sweep of radial scales.

## Evidence

Mean absolute difference (0–255) over the far field, three frames (55, 100, 170 s), each
candidate aligned on its own:

| Reading                              | Radial scale against the 100-degree reading | Mean cost |
| ------------------------------------ | ------------------------------------------- | --------- |
| Mei (`offset_v3`)                    | 1.00                                        | 13.65     |
| Mei                                  | 1.04                                        | 12.62     |
| Mei                                  | 1.053                                       | 12.69     |
| polynomial (`offset_v2`)             | 1.00                                        | 13.71     |
| equidistant, radius at 100°          | 1.00                                        | 13.02     |
| equidistant, radius at 97°           | 1.03                                        | 12.60     |
| equidistant, radius at 96°           | 1.04                                        | 12.61     |
| equidistant, radius at 95° (omnikit) | 1.053                                       | 12.97     |

Read at face value, both models draw every direction too close to its lens axis; scaled by 3 to
5 percent they match the export equally well, and at their best they cannot be told apart. The
block field of the aligned panoramas gives radial errors of the same size, with a spread of
about a percent between frames. The two models differ in shape as well: the equidistant reading
draws mid-field directions a tenth further out than the Mei model and the field edge 3 percent
further out. The far field cannot say which shape is right mid-field.

## Decision

- The legacy radius marks the direction 96 degrees from the lens axis (`LEGACY_RADIUS_ANGLE`),
  the middle of the flat part of the cost curve, which reaches from about 95 to 97 degrees. The
  field edge a lens images stays at 100 degrees.
- The legacy string is read first; `offset_v3` and `offset_v2` remain fallbacks for a recording
  without it. The Mei model would need a factor of 1.04 to 1.05 that nothing in its string
  explains; the equidistant model needs one named angle.

## Consequences

- Far content meets at the seams where Insta360's own stitch puts it, to the accuracy the
  reference allows, about a degree. Near objects still ghost: parallax, not geometry.
- The overlap band (85–95°) maps to radii of 2359 to 2636 canvas pixels on the X5 office lenses,
  inside the frame square; past 96.8 degrees the frame's edges cut the circle along the axes, as
  the raw lenses show.
- The `ready` metadata reports `offset` as the calibration version on an X5.
- The angle is known to about a degree. A second reference (an omnikit stitch, another Studio
  export) can refine it and settle the mid-field shape; the seam's disparity measures it without
  one (below).

## On a second unit (2026-09-29)

Insta360 Studio's export of the office recording (another X5 unit, 5.7K) joined the measurement,
and the lens readings record a second, reference-free measure: the disparity each reading leaves
between the lenses at the seam (ADR 0026). Parallax only moves the lenses' images of a near
object apart, so the far bins' disparity is the reading's own error there; a percent of radius
moves it by about 1.8 degrees. Median over the trusted bins, three frames each:

| Reading, radial scale against the core's | Sailing seam (°) | Office seam (°)  | Office far field |
| ---------------------------------------- | ---------------- | ---------------- | ---------------- |
| equidistant, radius at 96° (the core's)  | +1.6, −0.2, −0.7 | −1.5, −2.1, −2.4 | 12.3             |
| equidistant, radius at 97° (0.99)        | +4.0, +1.7, +0.7 | +0.1, −0.4, −1.1 | 11.6             |
| equidistant, radius at 98° (0.98)        | +6.0, +4.3, +4.3 | +1.9, +1.6, +0.7 | 11.0             |
| Mei, 1.02                                | +5.0, +3.0, +2.5 | +0.6, +0.4, −0.5 | 8.8              |
| Mei, 1.04                                | +0.8, −0.1, −0.5 | −2.6, −3.0, −1.9 | 10.4             |

- On the sailing unit the core's reading leaves the seam at zero, as does Mei at 1.04. On the
  office unit it leaves about −2 degrees, doubling far content at the seam, and the seam wants
  the radius at 97 degrees, or Mei at 1.02: the scale differs by about a percent between the
  units (or between their 8K and 5.7K modes).
- On the office unit the far field fits Studio better through the Mei model at any scale tried
  than through the equidistant one at any scale (8.8 against 11.0 and more): mid-field, the Mei
  shape is the lens's there.
- The far-field cost depends by about a level on where each candidate's alignment starts (the
  same reading scored 9.8 and 11.0 on sailing in two runs), so it cannot rank readings within a
  level; the seam's disparity does not depend on the alignment.

No reading fits both units at one scale. The recording itself can measure the scale at the seam,
without a reference: the far bins' disparity at zero.

## Alternatives considered

- Keeping the Mei model with a radial factor of 1.045: the same cost, a factor nothing explains.
- omnikit's 95 degrees as is: inside the flat part of the curve, but past the measured minimum.
- Settling the scale on the seams (the withdrawn refinement, ADR 0014's window reading): the
  parallax of near objects confounds the seams; the far field of an external stitch does not.
