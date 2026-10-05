# ADR 0012: Exposure matched along the seam ring, lens 0 the reference

Status: accepted (2026-09-20)

## Context

The two lenses expose independently; the sun on one side makes its lens darker, and the
blend band then shows a brightness step. Insta360's own stitcher hides it by matching the
lenses; a player showing raw frames must do the same or the seam is visible on every clip.

## Decision

Per-channel gains bring every lens's brightness along the seam ring to lens 0's. The seam
ring is the circle of body directions halfway through the blend band around lens 0's axis:
both lenses image it, so their colours there differ by exposure (and a little parallax), not
by content. The Three.js adapter renders what each lens sees along the ring into one row of a
64 x 2 target with the same lens-sampling GLSL as the stitch, reads it back asynchronously
every half second of presented frames, averages the imaged texels and hands the means to the
core's `GainMatcher`, which clamps the ratio to a factor of two (beyond that the difference is
content) and low-passes it over 1.5 seconds. Lens 0 is the reference because it is the lens
the viewer starts facing: its exposure must not shift under them. Channels darker than one
percent carry no exposure information and keep unit gain. On by default; `gain-match="off"`
keeps the recording as it was.

## Alternatives considered

- Matching whole-frame histograms: the lenses see different halves of the world, so their
  histograms differ legitimately; only the overlap is comparable.
- A symmetric reference (the geometric mean of both): every clip would brighten or darken the
  starting view a little; the reference lens keeps it as recorded.
- Analysing on the CPU from a downscaled copy: a full read-back per measurement, and a
  second implementation of the lens projection.
- Fixed gains from the camera's metadata: the files carry none.

## Consequences

One small extra render and an asynchronous read-back every half second while playing;
measurements are skipped while one is in flight and a failed read-back (a lost context) is
ignored until the next measurement, half a second of media later. Black channels keep unit gain;
directions either lens shows blown out are left out of the means, and a band with nothing left to
compare is not measured, the gains staying as they were (since 2026-10-05: before, only black
was guarded, and flare in one lens's overlap re-exposed the other lens's whole hemisphere). The
renderer's `setLensGains` also silences a lens for inspection: a gain of zero leaves the blend
altogether, so the other lens fills the feather band alone and a lens-only render shows that lens
as it is; the matcher overwrites the gains while it runs.

## Since ADR 0033 (2026-09-30)

The seam meter reads each lens's exposure signal, where its exposure is a factor, and the stitch
scales that signal before bringing it to the display: on an SDR camera the texel as recorded,
as before; on the X6, HLG's scene light raised to the display's power, before the highlight
roll-off, so one gain matches two lenses a stop apart in the shadows and in the sky alike.

## Since ADR 0039 (2026-10-05)

The reference was lens 0 because the view opened facing it. Since ADR 0039 the view opens a half
turn from lens 0 on every camera whose lens axis lies level, and on every recording whose gravity
cannot be read: lens 0 was behind the viewer, and the hemisphere in front of them was the one
re-exposed, the first measurement applied whole and every later change of exposure pumping it.
The reference is now the lens whose optical axis lies nearest the direction the view opens facing
(`referenceLensOf`, from the mounting and the lenses' poses): lens 1 on those cameras, either on a
lens-vertical one, whose view opens across both lenses.
