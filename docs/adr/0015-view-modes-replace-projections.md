# ADR 0015: View modes replace projections

Status: accepted (2026-09-25); "pitch and zoom are ignored" in the panorama and "no drag or zoom"
in the raw lenses superseded by ADR 0018

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
`setViewMode` bridge command and the "View" menu behind its own button in the control bar.

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

Each mode is a rules object (strategy; one module per mode since ADR 0018): how a drag, a turn
and a zoom move the view, and the picture it draws for a view. A picture
(`core/domain/view/Picture.ts`) is a union: a rectilinear or an equirectangular picture of the
stitched sphere, with its rotation and its area of the viewport, or the lens images in tiles.
The core decides which projection a mode uses; the renderer only knows how to draw each kind of
picture. A mode leaves alone what it does not show, so the normal view comes back unchanged
after a look at the panorama. A host setting the view directly (`lookAt`, the view attributes)
is obeyed in any mode.

## Alternatives considered

- Keeping the projection in the view state and adding values: every view change would keep
  carrying a setting that has nothing to do with where the viewer looks, and a mode that is
  not a projection of the sphere at all would have no place there.
- Stretching the panorama to the viewport, as before: a 16:9 player would show it squashed by
  about a tenth, which is not what an equirectangular video looks like.
- Letting pitch tilt the panorama: the horizon becomes a wave, which no exported video shows.

## Consequences

The `projection` attribute and URL parameter are gone without an alias (nothing was published
yet). A gesture a mode ignores announces nothing. The renderer asks the mode for the picture
of the current view and draws it with that kind's program: the stitch assembled with the
rectilinear or the equirectangular ray chunk, or the lens tiles pass, all over the same
uniforms and all compiled when the renderer is created, so switching modes swaps programs
without a pause. Pixels outside the picture's areas are black. A new mode that reuses a
projection is a change to core alone; a new projection is one picture kind, one ray chunk and
one program entry, each checked by the compiler. Gain matching keeps measuring while the raw
lenses show; its gains apply again when a stitched mode returns.

## Since 2026-10-05: a tall picture's height is bounded too

The 120-degree bound held across the picture only. On a phone held upright (about 0.46 wide
for each unit of height) the default 90 degrees across spanned 131 from top to bottom, and 120
across spanned 150, stretching the top and bottom edges about five times: the distortion the
bound exists to avoid, on the device motion look is made for. The field of view a rectilinear
picture shows (`shownFieldOfView` in `rectilinear.ts`) is now the view's, narrowed on a picture
taller than wide so that its height spans 120 degrees at most. The view state, the `fov`
attribute and `viewchange` keep the horizontal field the page set, so turning the phone back
shows it again. Drags count degrees per pixel at the shown field and the zoom toward the
pointer solves with it, so the point under a finger stays under it; a zoom starts from the
shown field, so zooming in shows at the first step and zooming out at the bound changes
nothing.
