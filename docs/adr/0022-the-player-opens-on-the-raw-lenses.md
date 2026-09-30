# ADR 0022: The player opens on the raw lenses

Status: accepted (2026-09-28)

## Context

A page that named no `view-mode` got the normal view: the stitched sphere through a
rectilinear window, where a visitor is meant to end up. The stitch is a fixed template from
the factory calibration (ADR 0008, ADR 0014), and the seam work ahead adds a per-recording
refinement of the back lens's pose that starts once the recording is open. A visitor who lands
in a stitched view sees the seam as the template draws it, before that refinement has run.

## Decision

The player opens on `raw-lenses`: each lens's decoded image as recorded, unstitched, which no
calibration touches. The view menu lists the modes in the order a visitor moves through them:
`raw-lenses`, `equirectangular`, `normal`. `VIEW_MODES` carries that order and
`DEFAULT_VIEW_MODE` its first entry; the menu, the renderer's initial mode, the player's view
and the embed's state mirror all read those constants. A page that wants a stitched view first
sets `view-mode`.

## Consequences

- Nothing stitched shows until the visitor or the page asks for it, so a seam calibration
  started at load has that time to converge before it is seen.
- The stabilization menu is hidden until a stitched mode is chosen, as it already was in the
  raw lenses.
- Tests of the stitched views name their mode; the player view's test helper starts in the
  normal view for the gesture tests.

## Alternatives considered

- Keeping the normal view first and covering it with the poster or a spinner until the
  calibration lands: hides what a visitor came for, and a recording without the data to refine
  would wait for nothing.
- Opening on the equirectangular panorama: stitched, so it shows the same seam.

## Since ADR 0033 (2026-09-30)

The raw lenses are shown through the display conversion: as recorded on an SDR camera, from HLG
to SDR on the X6, so the first picture of an X6 recording is not flat.
