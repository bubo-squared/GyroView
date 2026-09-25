# ADR 0015: View modes replace projections

Status: accepted (2026-09-25)

## Context

The player offered three projections of the stitched sphere, chosen per view: rectilinear
("Normal"), stereographic ("Little planet", up to 300 degrees across) and equirectangular
("Flat 360", stretched to whatever shape the viewport had and tilted by the view's pitch). The
projection was a field of the view state, so it travelled with every view change and every
`viewchange` event, and each projection needed its own field-of-view range and drag rate.

The little planet is a creative effect; a viewer of raw recordings wants to look around in an
ordinary picture, sometimes to see the whole recording at once as the equirectangular video an
export would produce, and sometimes to see what each lens actually recorded before any
stitching, to judge exposure, framing or the seam. Choosing between those is a choice of what
the player shows, not of where the viewer looks.

## Decision

The view state is only where the viewer looks: yaw, pitch and a horizontal field of view of 30
to 120 degrees. What the picture shows is a separate setting, the view mode, carried like the
stabilization mode: the `view-mode` attribute, `setViewMode`, the `viewmodechange` event, the
`setViewMode` bridge command and the settings menu's "View" choice.

- `normal`: the rectilinear window into the stitched, stabilized sphere, turned by drags and
  arrow keys and zoomed by the wheel, pinch and the zoom keys.
- `equirectangular`: the whole stitched sphere as a 2:1 panorama, letterboxed inside the
  viewport rather than stretched. It stays level: only the yaw, which picks the direction at
  its centre, follows drags (a whole turn per viewport width) and arrow keys; pitch and zoom are
  ignored. Stabilization applies as in the normal view.
- `raw-lenses`: each lens's region of its decoded frame exactly as the decoder delivered it,
  unstitched: no lens pose, no stabilization, no exposure gain, no drag or zoom. The images
  appear as the sensors are mounted, so they need not be upright or turned alike. The lenses
  get square tiles, in a row or stacked, whichever gives the larger tiles on the viewport, with
  black bars around. Tiles are square because every accepted layout has square lens images
  (square tracks, or the halves of a 2:1 packed frame).

Each mode is a rules object in `core/domain/view/ViewMode.ts` (strategy): how a drag, a turn
and a zoom move the view, the rotation the picture is drawn with, and where on the viewport
the picture goes. A mode leaves alone what it does not show, so the normal view comes back
unchanged after a look at the panorama. A host setting the view directly (`lookAt`, the view
attributes) is obeyed in any mode.

## Alternatives considered

- Keeping the projection in the view state and adding values: every view change would keep
  carrying a setting that has nothing to do with where the viewer looks, and a mode that is
  not a projection of the sphere at all would have no place there.
- Stretching the panorama to the viewport, as before: a 16:9 player would show it squashed by
  about a tenth, which is not what an equirectangular video looks like.
- Letting pitch tilt the panorama: the horizon becomes a wave, which no exported video shows.

## Consequences

The `projection` attribute and URL parameter are gone without an alias (nothing was published
yet). A zoom in the equirectangular view announces an unchanged view. The renderer receives
the mode beside the view and lays the picture out in the screen areas the mode chooses; pixels
outside them are black. The raw lenses are drawn by a second shader program over the same
uniforms, compiled with the stitch when the renderer is created, so switching modes swaps
programs without a pause. Gain matching keeps measuring while the raw lenses show; its gains
apply again when a stitched mode returns.
