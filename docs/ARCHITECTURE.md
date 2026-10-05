# Architecture

GyroView plays raw Insta360 `.insv` recordings in the browser: it reads the camera's file in
byte ranges, decodes the two fisheye tracks with WebCodecs, stitches and stabilizes them on the
GPU, and presents the result as a `<gyro-view>` element or an iframe. This document describes
how the code is organised and what the key components do. The decisions behind it are in
`docs/adr/`, the vocabulary in `docs/GLOSSARY.md`, the file format in `docs/FORMAT.md`.

## Shape

A hexagonal (ports and adapters) architecture in a pnpm workspace. Dependencies point inward
and `dependency-cruiser` fails the build on a violation.

```
 apps/embed ─────────────▶ packages/player ─────────────▶ packages/adapters/* ─────▶ packages/core
 (site, iframe bridge)     (composition root,            (one external technology     (domain, use cases,
                            <gyro-view>, controls)        each, implementing ports)    ports; no dependencies)
 apps/library ───────────▶ packages/player
 (the npm package @bubo-squared/gyroview: the player bundled with the core and the adapters)

 tools/insv-inspect ──▶ adapters/node + core        tools/fixtures ──▶ core        tools/integration ──▶ everything
```

| Layer               | Package(s)                                                                 | May import                                                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Domain, application | `packages/core`                                                            | nothing outside itself                                                                                           |
| Infrastructure      | `packages/adapters/{node,fetch,blob,mediabunny,webcodecs,mse-audio,three}` | `core` and one library each                                                                                      |
| Composition, UI     | `packages/player`                                                          | `core`, every adapter                                                                                            |
| Sites, npm package  | `apps/embed`, `apps/library`                                               | `player`, and `core`'s shared vocabulary (errors, modes, events, file names); the snippet carries no player code |
| Tools               | `tools/*`                                                                  | `core`; `insv-inspect` also the node adapter; `integration` also the other adapters and the player               |

Everything the core needs from the outside world is a **port**: a TypeScript interface it owns
in `core/src/ports`. Adapters implement ports; the player chooses which adapters to use. The
core has no runtime dependency, no DOM and no Node types, so its domain logic runs and is
tested anywhere.

## The core

### Domain: `core/src/domain`

The knowledge of the problem, as pure functions and value objects, split by subject.

**`format`: the `.insv` byte layout.** The only place that knows offsets, record ids and
sizes; every constant is named and cites its source.

- `boxes/scanBoxes` walks the MP4 boxes and finds where the Insta360 trailer starts, whether
  it is wrapped in an `inst` box (newer firmware) or bare.
- `mp4/parseMovie` reads the movie box into a `SampleTable` (ISO/IEC 14496-12: the track and
  media headers, the sample description and every sample table, 64-bit chunk offsets,
  composition offsets and edit lists included), each track with the key-frame rule of its codec
  (`mp4/keyframeRules`); a fragmented file is refused. `docs/FORMAT.md` lists what it reads.
- `trailer/readTrailer` reads the 72-byte footer and the records' table of contents, either
  through the index record or by walking record headers backwards (`locateRecords`), two
  strategies chosen by what the file contains.
- `info/readInfoRecord` finds the info record through the trailer, and `info/parseInfoRecord`
  decodes it from protobuf into `RecordingInfo`: camera, firmware,
  calibration strings, timing fields, layout hints. Absent fields are `undefined`.
- `records/gyro` parses IMU samples in the raw (20-byte) or float (56-byte) layout, selected by
  the info record or inferred from the bytes; `records/exposure` parses per-frame shutter times.
  `records/TrailerRecords` reads both on demand through the source.
- `layout/detectLensLayout` decides how the lens images are stored (a stitching `LensLayout`)
  from the video tracks the codec reader describes: multi-track (one file, two tracks), split files
  (`_00_` and `_10_`) or packed (both circles in one frame). The info record is only a hint.
- `naming/RecordingFileName` understands `VID_<date>_<time>_<lens><proxy>_<seq>.insv` to guess
  where the other lens file of a split-file pair lives; the guess is always verified against the
  file.
- `info/calibrationSources` declares where the info record keeps each calibration string;
  `calibration/parseOffsetString` turns its four versions (`offset`, `offset_v2`, and the Mei
  strings `offset_v3` and `offset_v6`, two rows of one `meiLayout` family, the v6 terms read by
  a `V6TermReading`, ADR 0032) into the optics `CalibrationSet`, with the radial scale its
  version is drawn at; `calibration/selectCalibration` picks the first usable one in the
  calibration preference, the legacy string first (ADR 0023).
- `captureOrigin` resolves the first frame's capture time in the gyro layout's unit, so motion
  receives branded values only.

Format is the anti-corruption layer: it produces motion, optics, view and stitching values, and
only it reads bytes through a port. Dependency rules keep every other domain folder free of format,
ports and application code.

**`optics`: lenses and calibration.** A `CalibrationSet` holds one `LensCalibration` per lens
and the radial scale they are drawn at; each lens has a `LensModel` strategy (`MeiModel`,
`PolynomialModel`, `EquidistantModel`) that builds the parameters of one of two projections, the
Mei model or a radial polynomial. `projectDirection` evaluates those parameters, a model's or a
stitching setup's lens drawn at its radial scale, on the CPU as the shader does on the GPU: the
reference the parsers and the shader are held to. The Mei model's distortion is `MeiDistortion`,
families of terms by order evaluated by `distortMei`, and `scaledProjection` applies a radial
scale to any model's parameters. `lensPose` gives the body-to-lens rotation from the calibration's yaw, pitch and
roll (ADR 0008, ADR 0025).

**`colour`: how a track's texels reach the display.** `TrackColour` is a video track's colour as
its bitstream names it. `DisplayConversion` is the data of one way of showing a track's texels
on the SDR BT.709 canvas, chosen per frame source by `displayConversionsOf` through a table over
every transfer: as recorded for SDR, HLG to SDR BT.709 for HLG (ADR 0033). `exposureSignalOf`
and `shownOf` are its two stages around the exposure gain, the references the shader is held
to; `matrixCorrectionOf` brings R′G′B′ a platform derived through another matrix back to the
track's. `gainMatch` holds the exposure-matching model, which scales the exposure signals of the
lenses onto one another (ADR 0012).

**`motion`: time and orientation.** `CaptureClock` relates the camera's microsecond clock to
video time. `FrameTimes` and the frame time sources (exposure record, track
timestamps, nominal rate) give every frame its mid-exposure instant, and find the frame shown at
a time by its place on the track's frame grid, since the camera's clock drifts from the track's
(over a frame in four minutes on the X5). `GyroTrack` is the IMU
record as a structure of arrays; `ImuFrame` says how the IMU's axes sit in the camera body
(measured per camera, ADR 0009); `OrientationTrack.integrate` turns gyro and accelerometer
into a body-to-world quaternion per sample (bias from the stillest window, gravity pull). The
`Stabilizer` strategies (`off`, `lock`, `horizon`, `follow`) turn an orientation into the
rotation the renderer applies.

**`stitching`**: `LensLayout` (where each lens's pixels are: which input, track and frame
region) and `StitchingSetup`, which joins calibration, layout and each frame source's display
conversion into the per-lens numbers a renderer binds (each frame shows its whole calibration
square, ADR 0014; each lens drawn at its calibration's radial scale, ADR 0023) and orders the
frame sources the session decodes (`lensFrameOrder`). The seam instruments measure how well the
lenses agree without drawing a picture: `seamStrip` (the seam ring 90 degrees from body +z and
the band 7 degrees either side of it, in 5-degree azimuth bins), `seamMismatch` (a bin's cost)
and `seamDisparity` (per bin, the slide of lens 0's sampling across the ring that aligns it with
lens 1). `seamDisparityField` makes a field of the bins' disparities, smoothed around the ring
and eased over time, and `seamJoin` names what a stitch does with it: the fixed template, or
the lenses' images bent toward each other. They serve `pnpm measure`; the player draws the
fixed join (ADR 0026).

**`container`**: the `SampleTable` of a file, a `TrackSampleTable` per track as a structure
of typed arrays: where each sample lies, when it shows and for how long, the sync sample at or
before one, the sample shown at a time; and the `KeyframeRule` that says whether a sample's
bytes start a keyframe.

**`download`**: `planDownloads`, the pure plan of a file's download from where its cursors
stand (ADR 0029): the window the picture reads in, what it wants within the budget, which
ranges to ask for, which transfers to give up and which bytes to let go of; `isReadyToResume`
and the resume threshold it and the plan share (ADR 0011); and the `DownloadPolicy` a file's
size and duration give.

**`playback`**: `PlayerStateMachine` with the exhaustive transition table
(`ready`, `playing`, `buffering`, `paused`, `seeking`, `ended`, `error`, `disposed`).

**`view`**: `ViewState` (yaw, pitch, the roll only motion look gives, field of view) with
clamping and the view rotation;
`Framing`, the view with the `Magnification` of the panorama and of the lens tiles;
`ViewMode` and its `ViewModeRules` strategy, one module per mode (`normalView`, `panoramaView`,
`lensTilesView`, looked up by `viewModes`): how drags, arrow keys and zooms toward a point change
its part of the framing, whether a drag moves the picture, how it resets, and the `Picture` it
draws: rectilinear, equirectangular or lens tiles (ADRs 0015 and 0018); `screenLayout` for
letterboxing and the screen's measures; `magnification` for enlarging and moving a flat picture
within its edges; `rectilinear` for the rays of the normal view's picture, shared with the
renderer; and the pure drag/zoom/look-at gestures, among them the normal view's zoom toward a
point. Motion look (ADR 0040): `screenLook` turns the browser's device attitude into the yaw,
pitch and roll of a screen held up as a window, the one place that knows the DeviceOrientation
convention; `motionLookView` follows the device's readings (`followReading`: the heading the
view's own, a gap starting anew, an unseen turn not drawn) and is `MOTION_LOOK_VIEW`, the normal
view's gesture rules (`ViewGestureRules`, the part of `ViewModeRules` without the picture) while
the device holds it, which `motionLookRulesFor` gives for the modes the device turns. Every mode's rules also say how a page's view is placed (`place`).

### Application: `core/src/application`

Use cases that orchestrate the domain through ports.

- `recording/timeRecording` relates a recording to video time: the capture clock, frame times
  for its first frame source (`frameTimesOf`: the sources in the order the info record's pts
  type prefers, the sample table only if needed) and the orientation for stabilization (`motionOf`: gyro integration with the camera's
  IMU frame), each optional with a warning for what is missing.
- `recording/readSampleTable` finds the movie box and reads it once, into the file's sample table
  and the movie bytes (`ftyp` and `moov`) a codec reader tells the codecs from.
- `download/FileDownload` downloads one file while it plays, the only reader of its bytes then
  (ADR 0029): its `SampleCursor`s say where each reader stands; it plans once a turn whenever
  a reader opens, closes or waits for bytes no transfer brings, once the readers have moved on
  by the policy's replan bytes (ADR 0036), when a range comes whole or fails, and when reading
  ahead starts, and carries the plan out through its `Transfers` (the ranges streaming, each
  into its block) and its `BlockStore`. `DownloadedVideoTrack` and
  `DownloadedAudioSamples` read a track through it; `startFileDownload` joins a file's tracks to
  their codecs by track id; `SourceByteStream` streams any random-access source a range at a
  time. A download is also a `MediaBuffer`, and `RecordingBuffer` is one over a recording's
  files: ready to resume once every file is.
- `recording/readRecording` opens a `RandomAccessSource` and reads everything cheap: the
  trailer's table of contents, the info record, the calibration choice. `inspectLayout` maps the
  boxes and the records' places for the inspector, which playing never needs. The result,
  `Recording`, hands out the large gyro and exposure records on demand, read by the format's
  `TrailerRecords`. `locateOtherLensFile` looks for the other lens's file of a split-file pair.
  `readRecordingFiles` reads the files a page gives as one recording, following the data: its
  metadata from the file that carries the trailer, every file's sample table and codecs, the
  other lens file of a lone half (before its tracks are read when the info record says the
  recording is split, once they fall short otherwise), then `detectLensLayout` and the
  calibration, which it requires. `inspectRecording` condenses a file into a `RecordingInspection`, plain data for a report or a
  page: its boxes and records, the info record, the calibration and summaries of the gyro and
  exposure records.
- `playback/DecodePipeline` runs one lockstep decode of all frame sources from a time: one
  decoder per source, packets fed under backpressure, frames paired by timestamp
  (`FramePairer`), pairs before the start dropped by the `StartGate`, output into a
  `FramePairQueue`.
- `playback/PlaybackSession` is the transport: it drives one `DecodeRun` at a time (a pipeline
  and its own queue, replaced whole on a seek) in step with a `PlaybackClock`, presents the pair due at each tick to a `FrameSink`, and owns the state
  machine. Sound follows the picture: playback waits in `buffering` until two pairs are queued,
  after a seek, and whenever the decoders fall behind (ADR 0011); `Buffering` holds why, and after starvation waits for the resume threshold as well. It also offers `preload`
  (first frame while ready) and `scrub` (seek to the key frame at or before a time). Its state
  machine and announcements are a `SessionLifecycle`: every change is heard once it is whole
  (ADR 0021).
- `playback/probeDecoding` decodes the first key frame of every lens track under a deadline
  before anything else is built, because platforms say yes to codecs they then fail on.
- `gainMatching/GainMatching` measures the seam through a `SeamMeter` every half second of
  media, one measurement at a time, and applies the gains `GainMatcher` follows onto the lens
  `referenceLensOf` names, the one the view opens facing (ADR 0012).
  `GainMatchingFrameSink` puts it in front of the sink chain: it measures after each
  presentation while enabled, with a meter the renderer creates over what it draws.
- `stabilization/StabilizingFrameSink` wraps the renderer and sets the
  stabilization rotation for each frame's mid-exposure orientation before presenting it.

### Ports: `core/src/ports`

| Port                 | What the core needs                                                                                                                             | Implementations                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RandomAccessSource` | `size()`, `read(ByteRange)`                                                                                                                     | `FileRandomAccessSource`, `HttpRangeSource`, `BlobRandomAccessSource` |
| `ByteStream`         | a range streamed a chunk at a time, given up by returning its iteration                                                                         | `HttpByteStream`, core `SourceByteStream`                             |
| `CodecReader`        | each track's decoder configuration, from the movie bytes held in memory                                                                         | `MediabunnyCodecReader`                                               |
| `VideoTrackReader`   | a video track's key frame times and its packets from a time                                                                                     | core `DownloadedVideoTrack`                                           |
| `AudioSampleSource`  | a sound track's samples from a time                                                                                                             | core `DownloadedAudioSamples`                                         |
| `AudioPackager`      | a sound track's samples re-packaged as an `AudioSegmentSource`                                                                                  | `MediabunnyAudioPackager`                                             |
| `MediaBuffer`        | whether enough lies downloaded ahead for playback that starved to resume, and word when more comes                                              | core `FileDownload`, `RecordingBuffer`                                |
| `VideoDecoderPort`   | create decoders that emit frames and apply backpressure                                                                                         | `WebCodecsVideoDecoderPort`                                           |
| `PlaybackClock`      | current time, start/pause/seek, whether it runs, end and failure                                                                                | `MediaSourceAudioClock`, core `application/playback/WallClock`        |
| `AudioSegmentSource` | the audio track as fragmented MP4 segments from a time                                                                                          | `MediabunnyAudioPackager`'s segments                                  |
| `FrameSink`          | present a frame pair                                                                                                                            | `ThreeFrameRenderer`                                                  |
| `PictureRenderer`    | a `FrameSink` that also takes the stabilization rotation, framing, view mode, size and lens gains, and creates a `SeamMeter` over what it draws | `ThreeFrameRenderer`                                                  |
| `SeamMeter`          | the mean colour each lens shows along the seam                                                                                                  | `SeamMeterPass`                                                       |
| `SeamMismatchMeter`  | per seam-strip bin, how far the lenses disagree for each slide of lens 0's sampling across the ring                                             | the lab's `SeamMismatchPass`                                          |
| `ResourceLocator`    | does this URL exist                                                                                                                             | `HttpResourceLocator`                                                 |

The core implements some ports itself (`WallClock`, `SourceByteStream`, `DownloadedVideoTrack`,
`DownloadedAudioSamples`, `FileDownload`, `RecordingBuffer`), from other ports and pure code.
`WallClock` reads time the host hands it (the page's monotonic clock) and holds no timer, so it
is as pure as the rest; the player uses it when a recording has no sound this browser plays.

The ports the core reads from have a contract suite in `core/src/testing`, run against their
fakes and their real implementations alike (`RandomAccessSource`, `ByteStream`, `CodecReader`,
`VideoTrackReader`, `AudioSampleSource`, `MediaBuffer`, `VideoDecoderPort`, `PlaybackClock`,
`ResourceLocator`), and `AudioSegmentSource`'s against the mediabunny packager alone, asserting
the error codes too; the player's attitude sensor has one in `player/src/test`. The ports the
core draws through (`FrameSink`, `PictureRenderer`, `SeamMeter`, `SeamMismatchMeter`) and
`AudioPackager` have none: the renderer's and the packager's own browser tests check what they
do.
`VideoTrackReader` and `MediaBuffer` are implemented in the core itself; they are ports because
the playback use cases may see nothing else.
`FakeFrameSink` only records what it is shown, for tests of what drives a sink; the renderer's
own browser tests check what it draws. `SimulatedLink` is a network in virtual time, for the
download's tests to assert to the byte what was asked for, what came and what was given up.
`core/src/testing` also holds what only tests need: the fixture builders (with `encodeAscii`)
and `equirectangularPixelOf`, the oracle the renderer tests read panoramas with.

### Shared: `core/src/shared`

Branded units (`Microseconds`, `Milliseconds`, `Seconds`, `Degrees`, `Radians`) so the
format's mixed units cannot be confused; `Vector3`, `Matrix3`, `Quaternion` with the rotation
conventions in one place; `GyroViewError` with stable codes and their categories (ADR 0030); a
`TypedEmitter`, and the `Outbox` that holds a change's events until the change is whole (ADR
0021); a protobuf reader;
`Deferred` for waiting without timers (the core has none); `lazy` for a value made
on first request.

## The adapters: `packages/adapters`

One package per external technology; none imports another.

- **`node`**: `FileRandomAccessSource` over the file system, for the CLI and Node tests.
- **`fetch`**: one `HttpResource` a URL holds what its readers share: the size, the proof of
  CORS, the retry rules (ADR 0019) and the version the first answer told of, which a replaced
  recording fails (`source-changed`). `HttpRangeSource` reads a range whole, `HttpByteStream`
  streams one as it comes, resuming from its next byte a range that broke off or stalled; both
  read past the browser's own cache (ADR 0013) and report the server's shortcomings with
  distinct codes (`range-unsupported`, `cors`, `source-unreadable`). `HttpResourceLocator`
  answers "does it exist" with a HEAD, and a one-byte GET where a server refuses HEAD.
- **`blob`**: `BlobRandomAccessSource` slices a `File` from a picker or a drop.
- **`mediabunny`**: `MediabunnyCodecReader` tells each track's decoder configuration from the
  movie bytes held in memory, and `MediabunnyAudioPackager` re-packages a sound track's samples
  into fragmented MP4 without re-encoding (ADR 0003, ADR 0007, ADR 0029). mediabunny reads no
  file of its own.
- **`webcodecs`**: `WebCodecsVideoDecoderPort`, hardware decoding in the browser with the
  port's key-frame and backpressure contract (ADR 0002).
- **`mse-audio`**: `MediaSourceAudioClock`, a hidden audio element fed through Media Source
  Extensions (`ManagedMediaSource` where it exists), so the recording's own sound is the master
  clock; `SourceBufferFeeder` keeps a window buffered and evicts behind the playhead.
- **`three`**: `ThreeFrameRenderer`, one fullscreen pass per frame with the program of the
  picture the view mode asks for (`pictureMaterials`); a changed setting is drawn when its
  `DrawSchedule` says, at once (`DRAW_AT_ONCE`, the tests' and the lab's) or as the composition
  schedules it (ADR 0035). The stitch (`stitch.frag.glsl` with the
  `rectilinearRays` or `equirectangularRays` chunk) turns every pixel of the picture's area into
  a ray, applies the view and stabilization rotations, projects through each lens model and
  blends across the feather band; `rawLenses.frag.glsl` copies each lens's frame region into its
  tile; the seam join chunk decides where each lens is read and across which band it is blended
  at the seam (`fixedJoin.glsl` in the player's stitch). `shaderPrograms` is the only place the
  order of GLSL chunks is known, `fullscreenPass` holds the triangle and material setup every
  pass shares, and `rendererUniforms` is the only place the shared uniform names are spelled (a
  test checks them against the chunks). `seamMeter/SeamMeterPass` is the `SeamMeter`: it renders
  the seam ring per lens into a tiny target and reads it back.
- **`three/lab`** (`@gyroview/adapter-three/lab`, for `pnpm measure` only; a dependency rule keeps
  the player and the apps from linking it): `LabRenderer`, the player's renderer with a lens pose
  to set, the bent seam join (`bentJoin.glsl`, `seamJoin`) and `seamMismatch/SeamMismatchPass`,
  the `SeamMismatchMeter`: it samples the seam strip from both lenses for every slide of lens 0
  and reduces each bin to a cost packed in 8-bit texels.

## The player: `packages/player`

The composition root and the user-facing element, in three layers.

- **`composition`**: `openRecording` is the use case that opens what a `PlayerSource` names:
  `readInputs` opens every input through the ports and hands them to the core's
  `readRecordingFiles`, with a lookup of the other lens file beside a lone URL; then one
  download a file (ADR 0029), the decode probe
  through them (an undecodable recording is an error; nothing plays in its place, ADR 0017),
  then the core's `timeRecording`. The downloads read only what the picture waits for until the
  pipeline's session first flows, then read ahead.
  It depends on `RecordingPorts` (`SourceOpener`, `CodecReader`, `AudioPackager`, `VideoDecoderPort`, a
  `ResourceLocator` for each input, so the other lens file is looked for with the main file's
  credentials (ADR 0027), a deadline factory), so it is tested against fakes; `browserPorts`
  supplies the real adapters. `buildPipeline` assembles the running parts: the clock (audio or wall),
  the renderer, which draws a changed setting once at the next animation frame
  (`AnimationFrameDraws` over the `FrameScheduler` the player's `FrameLoop` ticks on, ADR 0035),
  the stabilizing and gain-matching sinks, the session. The player receives it as a
  `PipelineFactory` and drives the `Pipeline` contract in `composition/ports`, never the
  adapters or the sinks: it sets the stabilization mode and gain matching as commands, which
  the pipeline routes to its sinks and shows at once; `createBrowserPlayer` joins the browser's ports and `buildPipeline` into a `Player`,
  for the element and for pages that want the player alone. `inspectRecording` reads a URL or a
  blob through the same sources into the core's `RecordingInspection`, without playing it. Dependency rules keep the adapters
  inside the composition and the composition below the player, and the player below the
  element and the controls.
- **`composition`, the attitude sensor**: `AttitudeSensor` is the player's port for the device's
  attitude; `BrowserAttitudeSensor` reads `deviceorientation` events, its page-wide probe telling
  whether the device reports them, and asks iOS for access within the tap (ADR 0040).
- **`player`**: `Player`, the headless facade over one loaded recording. Its methods take plain
  seconds and degrees, as a page gives them; the core's unit types start inside it. It loads, unloads,
  relays the session's states as media-element events (`SessionRelay`, `transportEventsFor`),
  ticks the session
  from a `FrameLoop`, keeps the canvas sized (`DrawingBufferFit`, whose ratio cap the quality sets), and owns the settings (view and view
  mode in `PlayerView`, which also keeps the device's hold on the view, motion look in
  `MotionLook`, which hears the sensor only while it turns something, stabilization, gain
  matching and quality in `PictureSettings`, sound in `PlayerSound`, the starts nobody awaits,
  autoplay and a press of play, in `PlaybackStarts`, the loop, which the session plays) across
  loads (ADR 0016). It and its parts announce through one `Outbox`, so a change is heard once it
  is whole (ADR 0021), the status once for each change (`StatusAnnouncer`); a page is handed
  its events to listen to (`Listenable`), never to emit. Its
  life with a recording is one `PlayerPhase`. The element drives it; the embed bridge drives the element.
- **`element`** and **`controls`**: `GyroViewElement` is `<gyro-view>`: attributes parsed by
  pure functions in `attributes.ts` (names in `attributeNames.ts`, published as
  `@gyroview/player/attributes`), settings properties live over the player (`liveSettings`),
  events re-dispatched as `CustomEvent`s and typed for listeners (`GyroViewElementEventMap`, over
  the pass-through `TypedEventElement`), a shadow tree with the canvas, the audio element,
  poster and overlays. `ElementLoads` decides when the element loads and what: the attributes
  read together a microtask after they change, a load owed to the next connection, a recording
  let go after a removal. The element tells a removal from a move (still out of the document a
  microtask later) and leaves the pinned fill on one too. The shadow tree (`template.ts`) is parsed
  once per page through a Trusted Types policy (`parseMarkup`) and cloned per element, its
  stylesheets constructed once and adopted. The markup holds no words: `Wording` fills in
  every label, menu choice and failure text it names, from `messages` (English defaults, the
  page's own through the element's `messages` property). `bindControlsBar` binds `TransportButtons`, the view buttons (Reset view,
  Fullscreen), `SeekBar` (key-frame
  scrubbing), `SoundControls`, `MotionLookButton` (the motion look toggle) and `PictureMenus` (the view mode and stabilization menus, each a
  `ChoiceMenu` behind a button that shows the icon of the choice in effect; stabilization is offered
  only for a recording with a gyro in a stitched view mode). How much the bar shows follows the
  player's width and the pointer (ADR 0028). The bar's markup and styles come from `controlsMarkup` and
  `controls.css`, which the element's template takes in, and every icon button draws an SVG
  from `icons`, cloned from one parsed copy when a button changes its icon. `ViewGestures` turns drags,
  pinches and wheel turns into view changes; `keyboard` maps keys to commands;
  `FullscreenToggle` and `IdleWatcher` handle filling the screen and fading the controls.

## The site: `apps/embed`

- `embed.html` (`pages/embedPage`) puts a full-viewport `<gyro-view>` up from its query string
  and, when embedded, bridges to the embedding page.
- `protocol/` is the versioned `postMessage` vocabulary (`hello`, `command`, `result`, `event`),
  validated on receipt, with the origin rules. `frame/EmbedHost` runs commands on the element
  and forwards its events; `bridge/EmbedHandle` is the embedding page's side, the player API as
  promises with a state mirror; both talk through an `Endpoint` (a window pair in production, a
  `MessagePort` in tests). What `embed.js` bundles (`snippet/`, `protocol/`, `bridge/`) never
  imports the player's code or the frame side (dependency-cruiser). ADR 0010.
- `snippet/embedSnippet` builds `embed.js`: `GyroView.embed(container, options, settings?)`
  creates the iframe and returns `{ iframe, handle, destroy }`; `settings.embedPageUrl` names
  `embed.html` where the script cannot tell (inlined). The site's `gyro-view.js` is the npm
  package's `standalone.js`, copied after the build, so there is one script-tag player.
- `index.html` (`pages/developmentPage`) is the developer page; `dev/samplesPlugin` lists the
  local sample recordings for it.

## The npm package: `apps/library`

- `src/index.ts` is the package's public API: the element, `createBrowserPlayer` and `Player`,
  `inspectRecording`, `GyroViewError`, the view and stabilization modes, and the types of the
  metadata, settings, events and inspection. The player types `<gyro-view>` in
  `HTMLElementTagNameMap`, and its events in `GyroViewElementEventMap`. `src/define.ts` registers the
  element when imported (`@bubo-squared/gyroview/define`).
- The build bundles the player, the core and the adapters, one file per module so a page's
  bundler drops what it does not reach, and leaves Three.js and mediabunny to the page's
  install; `dts-bundle-generator` writes one self-contained `index.d.ts`, without what is marked
  `@internal`,
  `consumer/usage.ts` is type-checked against it and publint checks the manifest. A test keeps
  the manifest's Three.js and mediabunny versions those of the adapters. ADR 0020.

## Tools and tests

- `tools/insv-inspect`: a CLI that prints the core's `inspectRecording` of a file on disk.
- `tools/fixtures`: assembles the synthetic recordings in `test/fixtures/synthetic` (tiny
  two-track MP4s with a real X5 trailer) that the browser tests play.
- `tools/integration`: end-to-end tests over the real sample recordings, in Node (the core over
  the node adapter) and in real browsers, where they open the samples through the player's
  `openRecording` with its pipeline settings, so they exercise the real composition, and draw
  with the player's renderer. Without the samples the Node tests skip and the browser project is
  not started. `src/measure/` holds the `pnpm measure` runs and, in `support/`, what only they
  use: the Studio references, the lens registration, the seam joins, all drawn through the lab
  renderer, which a dependency rule keeps out of every other tool.

Tests follow the layers: pure domain tests run in Node in milliseconds and are mutation-tested
with Stryker; adapters have contract tests against their ports and run in Chromium and WebKit
where they need a browser; the player and the site are tested in browsers over the synthetic
recordings; the integration suite adds the real files. `pnpm measure` also writes its renders
to `.artifacts/` and runs the measurements behind a camera's constants (the IMU frame ranking,
the lens pose and the lens readings against Insta360 Studio's stitch) and behind the bent seam's
trial (ADR 0026).

## Two flows

**Opening and playing a recording.** `<gyro-view src>` → `Player.load` → `openRecording`
(bytes through `SourceOpener`, `readRecording`, the sample tables and codecs, layout,
calibration, the downloads, probe, timing, motion) → `buildPipeline` (clock, `ThreeFrameRenderer`, `StabilizingFrameSink`,
`GainMatchingFrameSink`, `PlaybackSession`) → `ready` event → `preload` shows the first frame → `play` → the downloads read
ahead, the session starts a `DecodePipeline`, waits in `buffering` for two pairs, starts the
clock → on each
animation frame `tick` takes the pair due, the stabilizing sink sets the rotation for its
mid-exposure orientation, the renderer uploads the frames and draws one stitched pass; every
half second the gain-match pass measures the seam and adjusts the lens gains.

**Embedding.** `GyroView.embed` builds the frame URL from the options and this page's origin,
creates the iframe and an `EmbedHandle` listening only to the frame; the frame's `EmbedHost`
says `hello` with the element's state, which the handle's mirror starts from, then runs
validated commands on its element and forwards the element's events as plain data; the handle
rebuilds an error from its code and message, so the page hears it with its category.

## Rules that keep it this way

- The dependency rule is enforced by `.dependency-cruiser.cjs`; `core` may not import anything.
  Every package and app but the node adapter runs in a browser (the tools run in Node): no Node
  built-ins outside tests (dependency-cruiser), and their production code type-checks without
  Node's types, the fetch and mediabunny adapters and the embed app through a build tsconfig
  of their own, since their tests need Node.
- Variants of the format (trailer wrapper, record locator, gyro layout, calibration version,
  lens layout, frame-time source) are strategies selected from data in the file, never from the
  camera model string alone (ADR 0004). The IMU frame alone comes from the model string,
  reported as unverified until measured (ADR 0009).
- Units are branded types; rotations have one convention module; errors are `GyroViewError`s
  with stable codes; optional data is modelled as absence, required data missing is an error.
- Every decision that is not obvious from the code has an ADR; every concept has one name, in
  `docs/GLOSSARY.md`.
