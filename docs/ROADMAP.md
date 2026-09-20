# Roadmap

What the player does today, what is verified on real material, what is waiting on something
external, and what a next step could be. Dated so a reader can tell how current it is.

## Done (as of 2026-09-20)

**Playback of raw recordings.** Opens `.insv` files over HTTP byte ranges or from local
files; reads the Insta360 trailer (indexed or bare, `inst`-wrapped or not), the protobuf info
record, the gyro record (raw and float layouts) and the exposure record; detects how the two
lens images are stored (two tracks, two files, one packed frame); decodes both tracks in
lockstep with WebCodecs; follows the recording's own audio through Media Source Extensions,
or a silent clock without audio. Playback holds for frames rather than letting sound run
ahead; the first frame shows before play; the seek bar scrubs to key frames.

**Stitching.** One GPU pass per frame through the factory calibration (unified, polynomial or
equidistant lens model), with a feathered blend across the overlap and per-channel exposure
matching measured along the seam. Rectilinear, little-planet and equirectangular projections;
drag, pinch, wheel and keyboard look-around.

**Stabilization.** Gyro and accelerometer integrated into the camera's orientation, sampled at
each frame's mid-exposure; lock, horizon and follow modes, or off.

**Embedding.** `<gyro-view>` as an element (`gyro-view.js`) with attributes, properties,
events and controls; `embed.html` in an iframe driven by `embed.js` over a validated,
origin-checked message protocol; a developer page.

**Verified on real recordings.** Two Insta360 X5 files (5.7K60 and 8K30, firmware 1.7 and
1.11): layout, calibration, timing, the X5 IMU frame (by a world-stillness ranking), lock and
horizon stabilization, seam continuity, audio-locked playback and seeking. Other cameras and
layouts are covered by synthetic fixtures built from the documented format variants.

## Waiting on something only a user can supply

- **An X3 or X4 recording** (a 5.7K `_00_`/`_10_` pair and a packed sub-5.7K file would cover
  most): to verify the split-file and packed layouts, the `offset_v2`/`offset` calibration
  paths, the IMU frames of those cameras and the sign convention of the calibration's yaw and
  pitch on real material. The code paths exist and are tested on synthetic files; the IMU
  frames default to "aligned" with a `warning` until measured.
- **An iPhone**: to run the developer page on iOS Safari and confirm `ManagedMediaSource`
  audio, hardware decoder limits with several players on a page, and the pinned fullscreen
  fallback.
- **An Insta360 Studio export** of one clip: an external reference for stitching and
  stabilization quality.

## Known limits

- Stitching is a fixed template: objects closer than about three metres show parallax
  ghosting in the blend band.
- Recordings split into several `_NNN` segment files play one segment at a time.
- Playback speed is 1x; no buffered-ranges display (decoding is on demand).
- Firefox and Android are best effort: Firefox has WebCodecs only on desktop, Android
  decoders vary.

## Possible next steps

In rough order of value, none started:

1. Device-orientation look-around on phones (turn the phone to look).
2. Parallax-aware stitching using the calibration's lens translation and a chosen stitching
   distance.
3. WebGPU external textures for the frame upload, once WebGPU video import is broad enough.
4. Multi-segment recordings played as one.
5. `.insp` photos through the same stitcher.
6. Optical-flow seam refinement.
7. The decode pipeline in a worker, if main-thread scheduling ever shows in profiles (it did
   not on an M4 Pro).

## History

The work was planned and delivered in phases, recorded in the ADRs and commit history:
feasibility (`docs/FEASIBILITY.md`), format and CLI, media pipeline, stitching,
stabilization, player and embed, hardening. The phase plan itself lived outside the
repository; this roadmap replaces it as the statement of where the project stands.
