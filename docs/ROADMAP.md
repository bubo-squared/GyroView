# Roadmap

What the player does today, what is verified on real material, what is waiting on something
external, and what a next step could be. Dated so a reader can tell how current it is.

## Done (as of 2026-10-05)

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

**Weaker devices.** Profiled with Chromium's CPU throttling, GPU timer queries and WebKit: a
changed view, gain or quality is drawn once an animation frame (ADR 0035), so a drag in WebKit
no longer starves the frames of the recording; the download plans every few mebibytes rather
than at every sample (ADR 0036); opening reads and integrates the gyro in two thirds of the
time; the bundle leaves out mediabunny's demuxers of other formats.

**Stabilization.** Gyro and accelerometer integrated into the camera's orientation, sampled at
each frame's mid-exposure; lock, horizon and follow modes, or off, each drawn upright as the
camera was mounted, on its side or with its lens axis vertical, where its IMU frame is measured
(ADR 0038), and opening where Insta360 Studio centres the recording (ADR 0039).

**Motion look.** On a phone or tablet, a toggle in the normal view lets the device turn it as a
window into the recording: its whole attitude, roll included, so the horizon stays level with the
real one; drags then turn the heading alone, and a zoom narrows about the centre (ADR 0040).
Tested with emulated sensors and synthetic events in Chromium and WebKit; a real phone is still
to come (below).

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

One Insta360 X6 recording (8K50, 10-bit HLG, 9 s, shared privately, ADR 0031): the v6
calibration string (ADR 0032), the X6's IMU frame (ADR 0009), the radial scale its v6 lenses
want, by Studio's far field and the seam agreeing (ADR 0023), the lens pose (ADR 0025), the
canvas window and the field edge (ADR 0014), and HLG shown as Studio's SDR shows it (ADR 0033),
in Chromium and WebKit.

One Insta360 X4 Air recording (a local sample, ADR 0031): the X4 Air's IMU frame (ADR 0009) and
the gyro's timing against its frames (ADR 0034), in Chromium and WebKit.

One Antigravity A1 recording (a drone, a local sample, ADR 0031): it decodes, its `hvcC` header
left blank (ADR 0037); its IMU frame (ADR 0009) and the gyro's timing against its frames (ADR
0034); its lenses stand vertical, and every mode draws it upright, centred where Insta360 Studio
centres it (ADR 0038), in Chromium and WebKit.

One Insta360 X3 recording (a 5.7K `_00_`/`_10_` pair on a tripod, a local sample, ADR 0031): the
split-file layout, the `offset` calibration, its IMU frame by the levelling ranking against
Studio's export (ADR 0009); every mode draws it upright (ADR 0038), its horizon within 0.2 degrees
of Studio's, in Chromium and WebKit.

One Insta360 ONE RS 1-inch 360 recording (an H.264 `_00_`/`_10_` pair on a tripod, a local
sample, ADR 0031): it plays and stitches; its IMU's down is measured and every mode draws it
upright, the rest of its IMU frame assumed (ADR 0009).

## Waiting on something only a user can supply

- **An iPhone and an Android phone for motion look** (ADR 0040), over HTTPS: the permission prompt
  at the first press and a refusal, portrait and landscape, a level horizon when rolling, a steady
  picture looking straight up and down, the iframe embed (a tap outside the frame with motion look
  on: Chromium may pause an unfocused cross-origin frame's sensors), turning the phone between
  portrait and landscape with motion look on (the screen's angle and the canvas's size change at
  different moments, which may show a quarter-turn roll for a frame), whether a phone at rest stops
  redrawing, and the frames shown a second after three to five minutes with motion look on, for
  an 8K30 and a 5.7K60 recording (heat).

- **An X4 recording and a packed sub-5.7K file**: to verify the packed layout, the `offset_v2`
  calibration path, the X4's IMU frame and the calibration's pose reading (ADR 0025) on real
  material. The code paths exist and are tested on synthetic files; the X4's IMU frame defaults
  to "aligned" with a `warning` until measured.
- **A ONE RS recording that turns**: to measure the rest of its IMU frame (ADR 0009); one that
  stood still cannot tell the four quarter turns about its down apart.
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
- The X6's decisions rest on one unit's 9-second clip: its IMU frame, radial scale (1.008,
  where the X5's units would want 1.02 to 1.04 from the same kind of string) and tone curve
  are provisional. The v6 string's higher-order terms (`p3`, `p4`, `s1` to `s4`) stay unread:
  one clip cannot tell their reading (ADR 0032).
- The X4 Air's IMU frame rests on one clip held upright, gravity along one IMU axis: only its
  tilt and roll told the frame from the three other quarter turns about that axis. Provisional
  until a recording held another way confirms it (ADR 0009).
- The A1's IMU frame and forward rest on one 43-second flight (ADR 0009, ADR 0038). In flight a
  drone's accelerometer measures its thrust rather than gravity, and the gravity pull leans the
  horizon by under a degree towards it: the A1's horizon stays within 2.5 degrees of Studio's,
  within 1.9 without the pull, and the X5's alignments to Studio need up to 2.2.
- The ONE RS's horizon stands at least 2.3 degrees from Studio's on its one recording, under
  every IMU frame, and not for its calibration strings, whose lens poses agree within 0.15
  degrees; its IMU frame is assumed past its down (ADR 0009).
- HDR is shown as SDR: HLG through Insta360 Studio's curve, fitted to its pixels; PQ is drawn
  as recorded, with a warning. The 10 bits reach the shader as 8.
- The X6's 8K at 50 fps in 10 bits decodes at twice its frame rate on an M4 Pro (123 pairs a
  second in Chromium, 98 in WebKit), counting the decoders alone. Drawn, headless on the same
  machine, it reaches the screen at 49.6 pairs a second in Chromium and 48 in WebKit, skipping
  at most one pair in seven seconds, the GPU about 11 ms a pair in Chromium
  (`measure/framePacing.test.ts`). A real display (`GYROVIEW_HEADED=1`), Windows' GPUs and an
  iPhone's memory (a 10-bit frame is twice an X5's) are still to be checked. A machine with half
  that decoder falls behind and waits.
- Opening a recording integrates its whole gyro record on the main thread before the first
  frame: 70 ms for the 4.4-minute X5 office recording on an M4 Pro, a long task of half a second
  under six times CPU throttling, and longer the longer the recording. The record is read whole,
  in one range request, and kept as typed arrays a few times its size: an hour-long recording on
  an iPhone's memory is still to be checked.
- A raw gyro record whose info record states no accelerometer range is read at telemetry-parser's
  16 g. Every raw-layout camera seen states 32 g, so such a file would read gravity at half its
  strength, and stabilization would lose the accelerometer's correction of drift; telling the
  range from the resting magnitude waits for such a file.
- The 8K and 5.7K60 modes decode about as many pixels a second as one 8K30 stream: a phone
  or laptop whose decoder is of 4K60 class plays them in stretches between waits.
- While the device turns the view, motion look draws the stitch once a display frame: a 30 fps
  recording costs about twice the draws and 1.4 to 1.7 times the GPU time it does with the view
  still, measured headless (ADR 0040); a phone's heat over minutes is still to be measured.
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
- HEVC on Linux decodes only where the browser reaches the GPU through VA-API (Intel or AMD);
  with NVIDIA's own driver or in a virtual machine it is `codec-unsupported`. Chrome and
  Firefox have no software HEVC decoder, and one in WebAssembly would not keep up with two
  full-size lens tracks.

## Possible next steps

In rough order of value:

1. A field of view that follows the shape of the player: it is horizontal, so a phone in portrait
   at the default 90 degrees across shows about 130 degrees from top to bottom, which a window held
   up makes more noticeable.
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
8. For decoders that fall behind, decoding the base temporal layer alone, at half the frame
   rate, if a slower picture is wanted over a waiting one: in the X5 5.7K60 recording and the
   X4 Air recording examined, every other frame is a sub-layer non-reference picture (HEVC
   `TSA_N`, temporal id 1) that nothing else refers to, so skipping those halves the decode load.
   In the X5 8K30 recordings and the X6 recording examined, every frame is a reference.
9. The gyro integrated after the first frame, in slices between frames: the raw lenses, the
   default view, need no orientation, and the stitched views could wait for it.
10. A quality that follows the device, if the page's choice may be overruled: `fast` when frames
    are presented late while decoded ones wait, which only the GPU explains. Both lens frames are uploaded whole at every frame (two
    3840-pixel squares at 8K, about 120 MB of texels), which a phone's memory bandwidth feels
    first.

## History

The work was delivered in phases, each recorded in the ADRs and the commit history:
feasibility (`docs/FEASIBILITY.md`), format and CLI, media pipeline, stitching,
stabilization, player and embed, hardening. Everything a contributor needs to know about why
the code is as it is lives in this repository: the ADRs for the decisions, this roadmap for
where the project stands.
