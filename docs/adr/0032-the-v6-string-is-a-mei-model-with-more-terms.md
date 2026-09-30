# ADR 0032: The v6 calibration string is a Mei model with more terms, read as radial terms and one tangential pair

Status: provisional (2026-09-30); supersedes the v6 rejection of ADR 0005. The reading of the
higher-order terms is open until real footage decides it.

## Context

ADR 0005 recognised a 27-token calibration layout and rejected it as `unsupported-calibration`,
waiting for a recording that used it. The X5 writes that string beside v1 to v3 (info field
111, its factory copy in 112), so every X5 recording has carried it without anyone reading it;
the X5 stitches through its legacy string (ADR 0023). The Insta360 X6 writes only this string:
without it, an X6 recording has no usable calibration and fails with `no-calibration`.

Its version word is 394240 (`0x00060400`): version 6 in the high 16 bits, the same `0x0400` low
bits as the X5's v2 and v3 words. The token order is the one insta360-rs documents
(`docs/INSV_FORMAT.md`), a hypothesis this project checks rather than copies:

`xi fx fy cx cy yaw pitch roll tx ty tz k1 k2 k3 k4 k5 p1 p2 p3 p4 s1 s2 s3 s4 width height type`

insta360-rs describes the terms after the translation as "five radial terms, two radius-varying
tangential pairs and four thin-prism terms", recovered from Insta360's own software; it says it
has not qualified the X6 on real recordings.

## Evidence

The X5 writes the v3 and v6 strings for the same lenses, so v3 is a reference v6 can be read
against without footage. On both X5 units in `test/fixtures/x5/`:

- The first eleven tokens mean what v3's do: the principal points agree with v3's within 13
  canvas pixels, the angles within half a degree, the translations within 4 mm; width, height
  and lens type sit at 24 to 26 and equal v3's (10752 x 5376, lens type 113). v6 is a separate
  fit, not an extension of v3: its focal lengths and centres differ slightly.
- Radial: the unified model's normalisation `x, y / (z + xi)`, then `1 + k1 r² + ... + k5 r¹⁰`,
  draws v3's radial profile within 1.4 canvas pixels from the axis to 100 degrees, on all four
  lenses.
- Tangential: with `p1`, `p2` as OpenCV's pair (as in v3), v6 draws v3's image to 0.6 and 1.2
  canvas pixels RMS on the office unit's lenses, 1.4 and 2.8 on the sailing unit's, after a
  pose and centre fit of at most half a degree and 13 pixels.
- On the sailing unit, every simple reading of the rest makes that agreement worse, from 7 to
  50 pixels RMS: a second tangential pair `p3, p4`; Brown's radius multiplier
  `(1 + p3 r² + p4 r⁴)` on the first pair; OpenCV's thin prism `s1 r² + s2 r⁴` on x and
  `s3 r² + s4 r⁴` on y, and the same swapped or negated. v3 carries no such terms, so it cannot
  say they are wrong, only that the terms v3 has are read right.

## Decision

- `offset_v6` is read, as the Mei model with more terms: the Mei distortion's five radial terms
  and first tangential order; `p3`, `p4` and `s1` to `s4` are parsed and carried in the
  reading's input but not drawn (`V6_TERM_READING`, `calibration/v6TermReading.ts`).
- Its version is `CalibrationVersion.ExtendedMei` (6, the number its word declares); the
  calibration preference tries it after the legacy string and before v3, the newer fit of the
  same model first.
- The other readings are kept as candidates in the measurement tooling
  (`tools/integration/src/measure/support/v6TermReadings.ts`), all expressible as a
  `MeiDistortion`; the core ships one reading.

## Consequences

- An X6 recording stitches. An X5 recording does not change: its legacy string comes first.
- A wrong reading of the terms left out moves directions near the field edge by up to about a
  degree and a half on the X6, whose terms are larger than the X5's.
- The error code `unsupported-calibration` stays in the public list, though no layout throws it
  now: pages that match on it keep working.
- Open, and measured on a Studio export and on the seam (ADR 0023, ADR 0026) before this ADR is
  accepted: which reading of `p3`, `p4`, `s1` to `s4` Insta360's stitch uses, and the radial
  scale the Mei family needs on the X6 (the X5's needed 1.02 to 1.04).

## Alternatives considered

- Copying insta360-rs's projection: its knowledge of these terms comes from Insta360's
  binaries; this project reads the string from what the files themselves show.
- A separate lens model for v6: the terms are the Mei model's, with more of them; a family of
  terms in one model keeps one shader function (see the Mei distortion refactor).
- Reading the terms as OpenCV's thin prism because OpenCV names such terms: the X5's own v3
  string says that reading is worse.
