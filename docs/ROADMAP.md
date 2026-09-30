# Roadmap

What the player does today, what is verified on real material, what is waiting on something
external, and what a next step could be. Dated so a reader can tell how current it is.

## Done (as of 2026-09-30)

**Playback of raw recordings.** Opens `.insv` files over HTTP byte ranges or from local
files; reads the Insta360 trailer (indexed or bare, `inst`-wrapped or not), the protobuf info
record, the gyro record (raw and float layouts) and the exposure record; detects how the two
lens images are stored (two tracks, two files, one packed frame); decodes both tracks in
lockstep with WebCodecs; follows the recording's own audio through Media Source Extensions,
or a silent clock without audio. Playback holds for frames rather than letting sound run
ahead; the first frame shows before play; the seek bar scrubs to key frames.

**Remote playback.** Each file is downloaded in file order as it plays, from the core's own
reading of its sample tables (ADR 0029): the picture and the sound come from the same bytes,
fetched about once; a seek gives up what the old position still read at once; paused after
playing, the download stops at its budget; before the first play it reads only what opening
and the first frame need. A range that breaks off or stalls resumes from its next byte, and a
recording replaced at its URL while it plays fails with `source-changed`.

**Stitching.** One GPU pass per frame through the factory calibration (the legacy string's
equidistant model, its radius read as 96 degrees against Insta360 Studio's own stitch, ADR 0023;
the unified and polynomial strings as fallbacks; the lens pose as measured against the same
stitch, ADR 0025), with a feathered blend across the overlap and per-channel exposure
matching measured along the seam. A normal rectilinear view of 30 to 120 degrees with drag,
pinch, wheel and keyboard look-around; the whole sphere as a level, letterboxed
equirectangular panorama; and the raw lens images side by side or stacked, unstitched
(ADR 0015). Every view zooms toward the pointer, the flat ones up to eight times, and moves
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
continuity, audio-locked playback and seeking; the lens pose against Insta360 Studio's stitch
of both units' recordings (ADR 0025). Other cameras and layouts are covered by synthetic
fixtures built from the documented format variants.

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

## Known limits

- Stitching is a fixed template: objects closer than about three metres show parallax
  ghosting in the blend band, and people within a metre of the camera are cut or doubled
  along the seam. A seam bent by the disparity measured across it cuts the double image of
  objects a metre or two away by 40 percent and draws a person half a metre away single (ADR
  0026), but measuring the disparity takes 10 to 40 ms, too much for playback.
- The lens pose is measured against Insta360 Studio's stitch on two X5 units (ADR 0025): the
  lenses agree to about 0.3 degrees about every axis on the sailing unit, and about the lens
  axis on the office unit, whose clip shows no far content near the lens axes. The pitch sign
  and the Euler order are conventions.
- The lens model's radius at the seam differs between the units: the legacy radius at 96
  degrees leaves the sailing unit's seam at zero and the office unit's about 2 degrees short,
  which doubles far content there slightly; the office unit wants 97 degrees, or the Mei
  string's model scaled by 1.02, whose shape also fits its far field better (ADR 0023).
- Recordings split into several `_NNN` segment files play one segment at a time.
- Playback speed is 1x: another speed needs the decoders to keep up with it, which an 8K
  recording's barely do at 1x, and the sound to follow at that rate.
- No buffered ranges on the seek bar: the download holds up to 10 s ahead, but the element
  does not show it yet.
- The download's budget (128 MiB ahead, 32 MiB behind, shared by a pair's files) is a
  desktop's; an iPhone's memory under several players is still to be measured.
- The iframe embed speaks English: the element's `messages` do not cross the embed protocol.
- Firefox and Android are best effort: Firefox has WebCodecs only on desktop, Android
  decoders vary.

## Possible next steps

In rough order of value:

1. Device-orientation look-around on phones (turn the phone to look).
2. The lens model's radius measured per recording at the seam, where far content's disparity
   must be zero (ADR 0023, ADR 0026): one measurement over a few frames at load, no reference
   needed; and a choice between the equidistant and the Mei shapes from a second reference.
3. The bent seam in the player (ADR 0026), once measuring the disparity is ten times cheaper:
   fewer sub-samples, a coarse-to-fine slide, a measurement every few frames.
4. WebGPU external textures for the frame upload, once WebGPU video import is broad enough.
5. Multi-segment recordings played as one.
6. `.insp` photos through the same stitcher.
7. The decode pipeline in a worker, if main-thread scheduling ever shows in profiles (it did
   not on an M4 Pro).

## History

The work was delivered in phases, each recorded in the ADRs and the commit history:
feasibility (`docs/FEASIBILITY.md`), format and CLI, media pipeline, stitching,
stabilization, player and embed, hardening. Everything a contributor needs to know about why
the code is as it is lives in this repository: the ADRs for the decisions, this roadmap for
where the project stands.
