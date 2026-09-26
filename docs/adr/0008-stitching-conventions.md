# ADR 0008: Frames, lens poses and the canvas window used for stitching

Status: accepted (2026-09-18), verified on the X5 office and sailing recordings and the office LRV.
The canvas-window decision below is superseded by ADR 0014: the frame shows the whole square.

## Context

Insta360 documents neither the coordinate frames its calibration strings refer to nor how the
recorded frame maps onto the 10752 x 5376 calibration canvas. The X5 strings carry a roll near
90 degrees for both lenses and no half turn between them, and the info record names a sensor
window of 5312 x 5312 at offset 0 inside the 5376 x 5376 sensor. Getting any of this wrong
shows as an upside-down lens, a swapped side or a double edge at the seam.

## Decisions

- **Body frame**: x right, y down, z forward along lens 0's optical axis, right-handed. Lens
  frames follow the lens model convention (x right, y down, z along the axis).
- **Lens pose** (`lensRotation`): lens `i` first turns half a turn per lens index about the
  body's _lateral_ (x) axis, then the calibration's yaw (about y), pitch (about x) and roll
  (about the optical axis) apply in that order. The half turn about x, not y, comes from the
  first render: about y the back lens came out rotated 180 degrees in its image plane and its
  content on the wrong side of the seam; about x the person standing across the seam is upright
  and continuous.
- **Canvas window**: each lens image sits in the canvas square holding its principal point; the
  recorded frame shows the info record's sensor window inside that square (5312 of 5376 pixels,
  offset 0), or the whole square when the record says nothing. Evidence: with a 200-degree image
  circle of radius 2664 canvas pixels centred at 2690, the whole square would leave a black
  margin of about 12 frame pixels on each side, but the decoded frames are lit from the first
  column and row to the last on both recordings.
- **View**: yaw positive looks right, pitch positive looks up, field of view is horizontal;
  the normal view's rectilinear rays and the panorama's equirectangular rays are two small chunks
  assembled with one stitch shader
  (the stereographic projection was dropped by ADR 0015).
- **Blend**: weight `1 - smoothstep(85 deg, 95 deg, theta)` per lens, normalised; radial
  polynomial and Mei projections evaluated in the fragment shader from parameters the core
  exposes (`LensModel.projection`).

## Evidence kept

`tools/integration/src/browser/realRecordingRender.test.ts` renders one frame of each sample
(full recording, packed LRV proxy, 8K sailing), to `.artifacts/` for inspection under
`pnpm measure`, and records the image-circle extents. A seam-difference figure measured at the time (mean absolute difference
of the two lenses in the overlap band: 60 on the office frame, 73 on the sailing frame) was
dominated by parallax of near subjects and by the exposure difference between the lenses, and
did not separate the two window interpretations; the image-circle extents do.

## Alternatives considered

- Deriving the half turn from the calibration angles: they do not contain it.
- Mirroring instead of rotating the back lens: the text on the person's shirt reads correctly
  once rotated, so no mirror is involved.
- Ignoring the sensor window: rejected by the image-circle measurement.

## Consequences

Per-channel gain matching between the lenses is visible as a brightness step at the seam and is
deferred to the hardening phase; the renderer already exposes a per-lens gain. Parallax of
subjects closer than about a metre ghosts at the seam, as accepted in the plan. The Euler order
and the signs of the calibration yaw and pitch are fixed by convention, not yet by measurement:
their values are below half a degree on the X5, so a wrong order or sign would move the seam by
a few pixels at most; a camera with larger values would show it at the seam.
