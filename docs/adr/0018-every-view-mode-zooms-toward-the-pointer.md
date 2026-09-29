# ADR 0018: Every view mode zooms toward the pointer

Status: accepted (2026-09-26)

## Context

ADR 0015 gave each view mode its own rules and kept the flat pictures fixed: the equirectangular
panorama always showed the whole sphere, letterboxed, and the raw lenses showed both circles
whole, with no drag or zoom. Only the normal view zoomed, by its field of view, and always about
the centre. Viewers want to read detail in the panorama and to look at a lens closely, and a
zoom that pulls the spot under the mouse towards the edge of the screen has to be corrected by a
drag every time.

## Decision

Every view mode zooms, and a zoom from the wheel or a pinch keeps what is under the pointer (or
between the fingers) where it is. The keys and `zoom(steps)` zoom about the centre.

- **Normal** still zooms by its field of view, 30 to 120 degrees. The view turns so that the
  direction under the pointer stays under it: the pitch is solved exactly from that direction's
  height, the yaw from the rest (`zoomViewAt`). Near a pole with no such turn it zooms about the
  centre.
- **The flat pictures** are enlarged from their fitted size, 1 to 8 times, as a `Magnification`:
  a scale and the point of the picture at the centre of the viewport. The picture never shows a
  bar it could fill, and stays centred along an axis where it is smaller than the viewport.
  - The panorama keeps its centre in the middle across: it wraps, so sideways the zoom's anchor
    becomes a turn of the yaw, and a drag turns it a whole turn per width of the picture as
    shown (ADR 0015's "per viewport width" is the fitted case). Up and down it moves within its
    top and bottom, by drags and the up and down arrows; it stays level.
  - The raw lens tiles are enlarged together and, once zoomed, move in every direction by drags
    and arrows within their edges.
- **One framing** holds the view and both magnifications (`Framing`). Each mode changes its own
  part, so each keeps its zoom across mode switches and loads, and Reset view resets the
  current mode's part: the whole normal view, the panorama's zoom and the yaw it shares with
  the normal view, or the lens tiles' zoom. The renderer takes the framing (`setFraming`) and asks the mode for the picture;
  its shaders already drew any screen rectangle, so they did not change.
- **The cursor** is the grab hand only where a drag moves the picture (`canPan`): always in the
  stitched views, in the raw lenses once zoomed in.
- **The public view** stays the normal view's: `view`, `viewchange`, `fov`, `yaw` and `pitch`.
  The flat magnifications are internal to the player.

## Alternatives considered

- Zooming the flat pictures by the normal view's field of view: one number with two meanings,
  and the normal view would lose its zoom on a detour through another mode.
- Zooming about the centre everywhere: simpler, but every zoom needs a drag after it.
- Publishing the flat magnifications on the element and the bridge: a larger public surface
  before anyone has asked to script it.

## Consequences

The view mode rules take a framing and the viewport's size and lens count, so the player reads
its canvas's size for every gesture and `Player.pan` no longer takes a width. A zoom anchored at
the pointer turns the normal view and the panorama, which announces `viewchange`; zooming a flat
picture alone announces nothing. The cursor is checked as the pointer moves over the canvas, so
a zoom by the keys shows its hand at the next pointer movement.
