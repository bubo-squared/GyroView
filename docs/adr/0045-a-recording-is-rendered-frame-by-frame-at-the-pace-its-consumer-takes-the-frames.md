# ADR 0045: A recording is rendered frame by frame at the pace its consumer takes the frames

Status: accepted (2026-10-18)

## Context

A page that wants a stitched video, not a player, has to encode it: a 360 MP4 to upload, share
or keep instead of the camera's two lens files (issue #41). The player draws what its clock says
is due (ADR 0007): it drops a frame that comes late and shows one again while the next is
decoded, which is right for watching and wrong for an encoder, which needs every frame exactly
once, in order, as fast as it can take them and no faster. The canvas keeps no picture once
shown, so a `frame` listener taking snapshots of the player loses whatever it is too slow for.

Every part the encoder needs exists: the decode pipeline delivers pairs in order into a queue
with backpressure, the stabilizing and gain-matching sinks turn and scale them, and the renderer
draws the equirectangular picture into the whole of a 2:1 canvas, synchronously within
`present`. Only the clock stands in the way.

## Decision

**A rendition takes the decode pipeline's pairs in order, with no clock.** `openRendition`
opens a recording as the player does and yields one `VideoFrame` per frame of the span asked
for, drawn by the player's renderer behind the player's sinks. The consumer's `next()` is the
only pace: the queue holds four pairs, so the decoder waits for an encoder that falls behind, and
nothing is dropped or repeated.

- **The span** (`RenditionSpan`): every frame from `from` up to, not including, `to`, timed in
  whole microseconds from `from`. The pipeline's start gate also hands over the frame on screen
  at `from` when `from` falls between frames; the span leaves it out, so the first frame is the
  first at or after `from`. An end past the recording's ends with it; an empty, reversed or
  out-of-range span is refused as `invalid-argument` before anything is decoded. A span shorter
  than a frame that falls between two frames yields none.
- **The picture**: the equirectangular view, `width` pixels across and half as many down, so
  the panorama fills it without bars. Both sides must be even, as encoders of 4:2:0 video take
  them, so the width is a multiple of four (`renditionSizeOf`).
- **The settings** are the player's defaults unless given: its stabilization mode, gain
  matching on, its quality.
- **Gain matching waits between frames.** It measures the seam every half second of media time
  with an asynchronous read-back (ADR 0012), so in the player the frame a new gain first shows on
  depends on the GPU. A rendition awaits `GainMatchingFrameSink.settled()` after each frame: the
  gains measured on a frame apply from the next one, and two renditions of a recording are the
  same pixels.
- **It draws on an `OffscreenCanvas` of its own**, and touches no DOM, so it runs in a
  dedicated worker beside the encoder. A caller's canvas is not taken: the rendition would resize
  it and hold its WebGL2 context, and the option is easier to add later than to take back. `ThreeFrameRenderer` takes an
  `OffscreenCanvas` as it takes a canvas element (`RenderCanvas`).
- **A file cannot be mended, so the rendition fails where the player recovers.** An aborted
  signal rejects `frames()` with its reason rather than ending the loop as if every frame had
  been taken; a lost WebGL context fails it with `render-unavailable` rather than drawing blank
  frames; a drawing buffer smaller than the picture, as WebGL may give for 8K on a phone, is
  refused rather than cropped. However the loop ends, the frames, the renderer and the
  recording are let go.
- **Sound is the page's.** The recording's audio track is in the file as recorded, for an
  encoding library to copy; the rendition draws pictures only.
- **The composition owns the loop** (`renditionOf`), beside `buildPipeline`, whose stitching
  setup and sink choice it shares: use cases do not know each other, so the core gives the span
  and the settling, and the composition wires the pipeline, the queue and the sinks.

## Alternatives considered

- **Capturing the player's frames**: the player's clock still drops what a slow encoder misses,
  and a fast encoder still waits for real time.
- **A player mode without a clock**: the session, the frame loop and the transport would each
  grow a second behaviour that only an encoder uses; a rendition has none of their state.
- **Encoding inside the package**: the choice of codec, bitrate, container and sound is the
  page's, and an encoding library (Mediabunny, WebCodecs' `VideoEncoder`) does it in a few lines;
  the package would grow a dependency and an API for what it does not need to know.
- **Waiting for gain matching only at the end**: the gains of a frame would depend on how fast
  the read-backs come, and the same recording would encode to different pictures.

## Consequences

A page renders a recording in a worker, in a loop, and hands each frame to its encoder. On an
M-series Mac, two seconds of a ONE R 5.7K recording rendered at 3840 x 1920 came at 29.6 frames
a second in Chrome and 27 in Safari (2026-10-18), about real time for 29.97 fps; the encoder's
own time comes on top. The frames are those of the player's picture, so whatever the player gets
wrong about a camera, the rendition gets wrong too. Reframing, a rectilinear view following a path
of views over time, is the same loop with the normal view and a view per frame, left for later.
