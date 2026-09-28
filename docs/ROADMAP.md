# Roadmap

What the player does today, what is verified on real material, what is waiting on something
external, and what a next step could be. Dated so a reader can tell how current it is.

## Done (as of 2026-09-28)

**Playback of raw recordings.** Opens `.insv` files over HTTP byte ranges or from local
files; reads the Insta360 trailer (indexed or bare, `inst`-wrapped or not), the protobuf info
record, the gyro record (raw and float layouts) and the exposure record; detects how the two
lens images are stored (two tracks, two files, one packed frame); decodes both tracks in
lockstep with WebCodecs; follows the recording's own audio through Media Source Extensions,
or a silent clock without audio. Playback holds for frames rather than letting sound run
ahead; the first frame shows before play; the seek bar scrubs to key frames.

**Stitching.** One GPU pass per frame through the factory calibration (the legacy string's
equidistant model, its radius read as 96 degrees against Insta360 Studio's own stitch, ADR 0023;
the unified and polynomial strings as fallbacks; the lens pose as measured against the same
stitch, ADR 0025), with a feathered blend across the overlap and per-channel exposure
matching measured along the seam. A normal rectilinear view of 30 to 120 degrees with drag,
pinch, wheel and keyboard look-around; the whole sphere as a level, letterboxed
equirectangular panorama; and the raw lens images side by side or stacked, unstitched
(ADR 0015). Every view zooms toward the pointer, the flat ones up to four times, and moves
once zoomed (ADR 0018).

**Picture quality.** `fast`, `balanced` (the default) or `high`: the lens images are read along
each drawn pixel's footprint through a mip chain, which halves the aliasing and shimmer of the
panorama at `balanced` at no measurable cost on a laptop, and the drawing buffer's pixel ratio
is capped per quality. Kept across loads (ADR 0024).

**Stabilization.** Gyro and accelerometer integrated into the camera's orientation, sampled at
each frame's mid-exposure; lock, horizon and follow modes, or off.

**Embedding.** `<gyro-view>` as an element (`gyro-view.js`) with attributes, properties,
events and controls; `embed.html` in an iframe driven by `embed.js` over a validated,
origin-checked message protocol; a developer page.

**Verified on real recordings.** Three Insta360 X5 files from two camera units (5.7K60 and
8K30, firmware 1.7 and 1.11, and a second 8K30 recording of the 8K unit): layout, calibration,
timing, the canvas-to-frame mapping (by the image circle's centre in every frame, ADR 0014),
the X5 IMU frame (by a world-stillness ranking), lock and horizon stabilization, seam
continuity, audio-locked playback and seeking; the legacy radius and the lens pose against
Insta360 Studio's stitch of the sailing recording (ADR 0023, ADR 0025). Other cameras and
layouts are covered by synthetic fixtures built from the documented format variants.

## Waiting on something only a user can supply

- **An X3 or X4 recording** (a 5.7K `_00_`/`_10_` pair and a packed sub-5.7K file would cover
  most): to verify the split-file and packed layouts, the `offset_v2`/`offset` calibration
  paths, the IMU frames of those cameras and the calibration's pose reading (ADR 0025) on real
  material. The code paths exist and are tested on synthetic files; the IMU frames default to
  "aligned" with a `warning` until measured.
- **An iPhone**: to run the developer page on iOS Safari and confirm `ManagedMediaSource`
  audio, hardware decoder limits with several players on a page, the pinned fullscreen
  fallback, that the volume slider hides where the volume cannot be set, and that the
  `balanced` quality holds the recording's frame rate.
- **An Insta360 Studio export of the office recording**, made like the sailing one: the
  office camera is a second X5 unit, so it would confirm the lens pose of ADR 0025 beyond one
  camera, and settle whether the front lens's roll is read mirrored like the back lens's (on
  the sailing unit the two readings of the front lens differ by 0.14 degrees, too little to
  tell; on the office unit by 1.05).

## Known limits

- Stitching is a fixed template: objects closer than about three metres show parallax
  ghosting in the blend band, and people within a metre of the camera are cut or doubled
  along the seam.
- The vertical step at the side seams, the strip missing near the nadir and the doubling near
  the zenith of the X5 files came from the lens pose: the calibration's roll read in the wrong
  sense and the back lens's yaw applied after its half turn. Measured against Insta360 Studio's
  stitch of the sailing recording (ADR 0025), the two lenses now agree to about 0.3 degrees,
  from 1.8. What remains at the seams is parallax, and the pitch sign is a convention. A rigid refinement
  of the back lens's pose and the radial scale, estimated from the seam while the recording
  plays, was built and withdrawn the same day: on the office recording it removed the step,
  on the sailing recording the people within a metre of the camera dominated the estimate,
  the biased correction misaligned everything else, and the near people stayed torn, since
  no rigid calibration aligns two depths at once with lenses 3.2 cm apart.
- The frame is mapped onto the whole calibration square, and the legacy radius spans 96 degrees,
  known to about a degree from the Studio export of the sailing recording (ADR 0023); the
  mid-field shape of the lens (equidistant against the Mei string's curve) is not settled.
- Recordings split into several `_NNN` segment files play one segment at a time.
- Playback speed is 1x: another speed needs the decoders to keep up with it, which an 8K
  recording's barely do at 1x, and the sound to follow at that rate.
- No buffered ranges: the player reads the recording in byte ranges as it plays and decodes a
  few frames ahead, so nothing lies downloaded ahead for a seek bar to show.
- The iframe embed speaks English: the element's `messages` do not cross the embed protocol.
- Firefox and Android are best effort: Firefox has WebCodecs only on desktop, Android
  decoders vary.

## Possible next steps

In rough order of value. The second is planned next: first a trial in `pnpm measure` against
the Studio exports, then in the player only if it removes the ghosting without new artifacts.

1. Device-orientation look-around on phones (turn the phone to look).
2. Parallax-aware stitching. A single stitching distance (the calibration's lens translation
   and a chosen depth) helps only what sits at that depth; serving near people and a far
   horizon at once needs a local alignment of the blend band per azimuth, measured from what
   both lenses see there (optical-flow style, what Insta360 calls dynamic stitching), which
   would also absorb what remains of the lens pose without a rigid correction.
3. WebGPU external textures for the frame upload, once WebGPU video import is broad enough.
4. Multi-segment recordings played as one.
5. `.insp` photos through the same stitcher.
6. The decode pipeline in a worker, if main-thread scheduling ever shows in profiles (it did
   not on an M4 Pro).

## History

The work was delivered in phases, each recorded in the ADRs and the commit history:
feasibility (`docs/FEASIBILITY.md`), format and CLI, media pipeline, stitching,
stabilization, player and embed, hardening. Everything a contributor needs to know about why
the code is as it is lives in this repository: the ADRs for the decisions, this roadmap for
where the project stands.
