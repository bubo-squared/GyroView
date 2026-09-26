# Roadmap

What the player does today, what is verified on real material, what is waiting on something
external, and what a next step could be. Dated so a reader can tell how current it is.

## Done (as of 2026-09-26)

**Playback of raw recordings.** Opens `.insv` files over HTTP byte ranges or from local
files; reads the Insta360 trailer (indexed or bare, `inst`-wrapped or not), the protobuf info
record, the gyro record (raw and float layouts) and the exposure record; detects how the two
lens images are stored (two tracks, two files, one packed frame); decodes both tracks in
lockstep with WebCodecs; follows the recording's own audio through Media Source Extensions,
or a silent clock without audio. Playback holds for frames rather than letting sound run
ahead; the first frame shows before play; the seek bar scrubs to key frames.

**Stitching.** One GPU pass per frame through the factory calibration (unified, polynomial or
equidistant lens model), with a feathered blend across the overlap and per-channel exposure
matching measured along the seam. A normal rectilinear view of 30 to 120 degrees with drag,
pinch, wheel and keyboard look-around; the whole sphere as a level, letterboxed
equirectangular panorama; and the raw lens images side by side or stacked, unstitched
(ADR 0015). Every view zooms toward the pointer, the flat ones up to four times, and moves
once zoomed (ADR 0018).

**Stabilization.** Gyro and accelerometer integrated into the camera's orientation, sampled at
each frame's mid-exposure; lock, horizon and follow modes, or off.

**Embedding.** `<gyro-view>` as an element (`gyro-view.js`) with attributes, properties,
events and controls; `embed.html` in an iframe driven by `embed.js` over a validated,
origin-checked message protocol; a developer page.

**Verified on real recordings.** Two Insta360 X5 files (5.7K60 and 8K30, firmware 1.7 and
1.11): layout, calibration, timing, the canvas-to-frame mapping (by the image circle's centre
in every frame, ADR 0014), the X5 IMU frame (by a world-stillness ranking), lock and horizon
stabilization, seam continuity, audio-locked playback and seeking. Other cameras and layouts
are covered by synthetic fixtures built from the documented format variants.

## Waiting on something only a user can supply

- **An X3 or X4 recording** (a 5.7K `_00_`/`_10_` pair and a packed sub-5.7K file would cover
  most): to verify the split-file and packed layouts, the `offset_v2`/`offset` calibration
  paths, the IMU frames of those cameras and the sign convention of the calibration's yaw and
  pitch on real material. The code paths exist and are tested on synthetic files; the IMU
  frames default to "aligned" with a `warning` until measured.
- **An iPhone**: to run the developer page on iOS Safari and confirm `ManagedMediaSource`
  audio, hardware decoder limits with several players on a page, the pinned fullscreen
  fallback, and that the volume slider hides where the volume cannot be set.
- **An Insta360 Studio export** of one clip: an external reference for stitching and
  stabilization quality.

## Known limits

- Stitching is a fixed template: objects closer than about three metres show parallax
  ghosting in the blend band, and people within a metre of the camera are cut or doubled
  along the seam.
- The seam on the X5 files also shows a vertical step at the side seams and a strip missing
  near the nadir and doubled near the zenith. Measured across the overlap band (2026-09-25),
  these amount to a turn of the back lens of about 1.0 degree about lens 0's axis (twice the
  factory roll difference between the lenses, so a sign convention somewhere in ADR 0008's
  reading of the calibration angles) plus an offset along the seam of 2 to 4 degrees that
  carries the scene's parallax on top of a scale error of about 1 percent. A rigid refinement
  of the back lens's pose and the radial scale, estimated from the seam while the recording
  plays, was built and withdrawn the same day: on the office recording it removed the step,
  on the sailing recording the people within a metre of the camera dominated the estimate,
  the biased correction misaligned everything else, and the near people stayed torn, since
  no rigid calibration aligns two depths at once with lenses 3.2 cm apart.
- The frame is mapped onto the whole calibration square; a 1.2 % scale uncertainty (about two
  degrees of relative shift at the seam) remains until another camera's window record or a Studio export
  settles it (ADR 0014).
- Recordings split into several `_NNN` segment files play one segment at a time.
- Playback speed is 1x; no buffered-ranges display (decoding is on demand).
- Firefox and Android are best effort: Firefox has WebCodecs only on desktop, Android
  decoders vary.

## Possible next steps

In rough order of value, none started:

1. Device-orientation look-around on phones (turn the phone to look).
2. Parallax-aware stitching. A single stitching distance (the calibration's lens translation
   and a chosen depth) helps only what sits at that depth; serving near people and a far
   horizon at once needs a local alignment of the blend band per azimuth, measured from what
   both lenses see there (optical-flow style, what Insta360 calls dynamic stitching), which
   would also absorb the pose and scale errors above without a rigid correction.
3. WebGPU external textures for the frame upload, once WebGPU video import is broad enough.
4. Multi-segment recordings played as one.
5. `.insp` photos through the same stitcher.
6. The decode pipeline in a worker, if main-thread scheduling ever shows in profiles (it did
   not on an M4 Pro).

## History

The work was planned and delivered in phases, recorded in the ADRs and commit history:
feasibility (`docs/FEASIBILITY.md`), format and CLI, media pipeline, stitching,
stabilization, player and embed, hardening. The phase plan itself lived outside the
repository; this roadmap replaces it as the statement of where the project stands.
