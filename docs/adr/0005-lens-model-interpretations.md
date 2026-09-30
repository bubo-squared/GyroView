# ADR 0005: Interpretation of the three calibration string versions

Status: accepted with open items (2026-09-18). The v1 radius angle and the preference for the Mei
model are superseded by ADR 0023: the legacy radius spans 96 degrees and the legacy string is read
first. The v6 rejection is superseded by ADR 0032: the v6 string is read.

## Context

Insta360 does not document its calibration strings. The X5 info record carries all three
(`offset`, `offset_v2`, `offset_v3`) for the same lenses, which allows cross-checking.

## Decisions

- `offset_v3` is the unified (Mei) camera model with xi, fx, fy, cx, cy, yaw, pitch, roll,
  translation, k1..k3, p1, p2 per lens, as documented by telemetry-parser and insta360-rs.
- `offset` (v1) is `r cx cy yaw pitch roll` per lens; `cx, cy` match v2/v3 exactly. Its radius
  equals the Mei model's radius at exactly 100 degrees on both X5 lenses (within ~2 px), so v1 is
  modelled as equidistant with the radius marking the 100-degree field edge.
- `offset_v2` is `r cx cy yaw pitch roll tx ty tz c1..c4 w h type` per lens. Its normalisation is
  undocumented; evaluating `c1*t + c2*t^2 + c3*t^3 + c4*t^4` with `t` in radians and scaling so the
  100-degree edge maps to `r` reproduces the Mei model within 9 px on both lenses. Other
  candidates (normalised angles, odd-power series, inverse mapping) were 27 px or worse.
- The v6 layout (27 tokens per lens) is recognised and rejected with `unsupported-calibration`.

## Open items

- Confirm the v2 interpretation on a recording that carries only `offset_v2` (X3).
- Decode the v6 coefficient order when a file using it appears: done in ADR 0032, from the X5's
  own v6 strings (field 111), which this ADR had not looked for.
