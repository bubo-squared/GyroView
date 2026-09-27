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

 tools/insv-inspect ──▶ adapters/node + core        tools/fixtures ──▶ core        tools/integration ──▶ everything
```

| Layer               | Package(s)                                                                 | May import                                                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Domain, application | `packages/core`                                                            | nothing outside itself                                                                                           |
| Infrastructure      | `packages/adapters/{node,fetch,blob,mediabunny,webcodecs,mse-audio,three}` | `core` and one library each                                                                                      |
| Composition, UI     | `packages/player`                                                          | `core`, every adapter                                                                                            |
| Sites               | `apps/embed`                                                               | `player`, and `core`'s shared vocabulary (errors, modes, events, file names); the snippet carries no player code |
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
  from the tracks the demuxer port describes: multi-track (one file, two tracks), split files
  (`_00_` and `_10_`) or packed (both circles in one frame). The info record is only a hint.
- `naming/RecordingFileName` understands `VID_<date>_<time>_<lens><proxy>_<seq>.insv` to guess
  where the other lens file of a split-file pair lives; the guess is always verified against the
  file.
- `calibration/parseOffsetString` turns the three generations of calibration strings
  (`offset`, `offset_v2`, `offset_v3`, one layout class each) into the optics `CalibrationSet`;
  `calibration/selectCalibration` picks the newest usable one.
- `captureOrigin` resolves the first frame's capture time in the gyro layout's unit, so motion
  receives branded values only.

Format is the anti-corruption layer: it produces motion, optics, view and stitching values, and
only it reads bytes through a port. Dependency rules keep every other domain folder free of format,
ports and application code.

**`optics`: lenses and calibration.** A `CalibrationSet` holds one `LensCalibration` per lens;
each lens has a `LensModel` strategy (`MeiModel`, `PolynomialModel`, `EquidistantModel`) that maps a
direction to a canvas pixel and also exposes its parameters for the shader. `lensPose` gives
the body-to-lens rotation from the calibration's yaw, pitch and roll (ADR 0008). `gainMatch`
holds the exposure-matching model (ADR 0012).

**`motion`: time and orientation.** `CaptureClock` relates the camera's microsecond clock to
video time. `FrameTimes` and the `FrameTimeSource` strategies (exposure record, track
timestamps, nominal rate) give every frame its mid-exposure instant, and find the frame shown at
a time by its place on the track's frame grid, since the camera's clock drifts from the track's
(over a frame in four minutes on the X5). `GyroTrack` is the IMU
record as a structure of arrays; `ImuFrame` says how the IMU's axes sit in the camera body
(measured per camera, ADR 0009); `OrientationTrack.integrate` turns gyro and accelerometer
into a body-to-world quaternion per sample (bias from the stillest window, gravity pull). The
`Stabilizer` strategies (`off`, `lock`, `horizon`, `follow`) turn an orientation into the
rotation the renderer applies.

**`stitching`**: `LensLayout` (where each lens's pixels are: which input, track and frame
region) and `StitchingSetup`, which joins calibration and layout into the per-lens numbers a
renderer binds (each frame shows its whole calibration square, ADR 0014) and orders the frame
sources the session decodes (`lensFrameOrder`).

**`playback`**: `PlayerStateMachine` with the exhaustive transition table
(`ready`, `playing`, `buffering`, `paused`, `seeking`, `ended`, `error`, `disposed`).

**`view`**: `ViewState` (yaw, pitch, field of view) with clamping and the view rotation;
`Framing`, the view with the `Magnification` of the panorama and of the lens tiles;
`ViewMode` and its `ViewModeRules` strategy, one module per mode (`normalView`, `panoramaView`,
`lensTilesView`, looked up by `viewModes`): how drags, arrow keys and zooms toward a point change
its part of the framing, whether a drag moves the picture, how it resets, and the `Picture` it
draws: rectilinear, equirectangular or lens tiles (ADRs 0015 and 0018); `screenLayout` for
letterboxing and the screen's measures; `magnification` for enlarging and moving a flat picture
within its edges; `rectilinear` for the rays of the normal view's picture, shared with the
renderer; and the pure drag/zoom/look-at gestures, among them the normal view's zoom toward a
point.

### Application: `core/src/application`

Use cases that orchestrate the domain through ports.

- `recording/timeRecording` relates a recording to video time: the capture clock, frame times
  for its first frame source (`frameTimesOf`: the sources in the order the info record's pts
  type prefers, the sample table only if needed) and the orientation for stabilization (`motionOf`: gyro integration with the camera's
  IMU frame), each optional with a warning for what is missing.
- `recording/readRecording` opens a `RandomAccessSource` and reads everything cheap: the
  trailer's table of contents, the info record, the calibration choice. `inspectLayout` maps the
  boxes and the records' places for the inspector, which playing never needs. The result,
  `Recording`, hands out the large gyro and exposure records on demand, read by the format's
  `TrailerRecords`. `locateOtherLensFile` looks for the other lens's file of a split-file pair.
- `playback/DecodePipeline` runs one lockstep decode of all frame sources from a time: one
  decoder per source, packets fed under backpressure, frames paired by timestamp
  (`FramePairer`), pairs before the start dropped by the `StartGate`, output into a
  `FramePairQueue`.
- `playback/PlaybackSession` is the transport: it drives one `DecodeRun` at a time (a pipeline
  and its own queue, replaced whole on a seek) in step with a `PlaybackClock`, presents the pair due at each tick to a `FrameSink`, and owns the state
  machine. Sound follows the picture: playback waits in `buffering` until two pairs are queued,
  after a seek, and whenever the decoders fall behind (ADR 0011). It also offers `preload`
  (first frame while ready) and `scrub` (seek to the key frame at or before a time).
- `playback/probeDecoding` decodes the first key frame of every lens track under a deadline
  before anything else is built, because platforms say yes to codecs they then fail on.
- `gainMatching/GainMatching` measures the seam through a `SeamMeter` every half second of
  media, one measurement at a time, and applies the gains `GainMatcher` follows (ADR 0012).
  `GainMatchingFrameSink` puts it in front of the sink chain: it measures after each
  presentation while enabled, with a meter the renderer creates over what it draws.
- `stabilization/StabilizingFrameSink` wraps the renderer and sets the
  stabilization rotation for each frame's mid-exposure orientation before presenting it.

### Ports: `core/src/ports`

| Port                 | What the core needs                                                                                                                             | Implementations                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RandomAccessSource` | `size()`, `read(ByteRange)`                                                                                                                     | `FileRandomAccessSource`, `HttpRangeSource`, `BlobRandomAccessSource` |
| `Demuxer`            | open a container, list `VideoTrackReader`s and audio tracks that open as `AudioSegmentSource`s                                                  | `MediabunnyDemuxer`                                                   |
| `VideoDecoderPort`   | create decoders that emit frames and apply backpressure                                                                                         | `WebCodecsVideoDecoderPort`                                           |
| `PlaybackClock`      | current time, start/pause/seek, whether it runs, end and failure                                                                                | `MediaSourceAudioClock`, core `application/playback/WallClock`        |
| `AudioSegmentSource` | the audio track as fragmented MP4 segments from a time                                                                                          | `MediabunnyAudioSegments`                                             |
| `FrameSink`          | present a frame pair                                                                                                                            | `ThreeFrameRenderer`                                                  |
| `PictureRenderer`    | a `FrameSink` that also takes the stabilization rotation, framing, view mode, size and lens gains, and creates a `SeamMeter` over what it draws | `ThreeFrameRenderer`                                                  |
| `SeamMeter`          | the mean colour each lens shows along the seam                                                                                                  | `SeamMeterPass`                                                       |
| `ResourceLocator`    | does this URL exist                                                                                                                             | `HttpResourceLocator`                                                 |

Every port whose adapter talks to the platform has a contract suite that runs against its fake
in `core/src/testing` and the real adapters alike (`RandomAccessSource`, `Demuxer`,
`VideoTrackReader`, `VideoDecoderPort`, `PlaybackClock`, `ResourceLocator`), asserting the error
codes too. `FakeFrameSink` only records what it is shown, for tests of what drives a sink; the
renderer's own browser tests check what it draws. Audio
reading and segmenting have no fake: only the real adapters exist and they are tested directly.
`core/src/testing` also holds what only tests need: the fixture builders (with `encodeAscii`)
and `equirectangularPixelOf`, the oracle the renderer tests read panoramas with.

### Shared: `core/src/shared`

Branded units (`Microseconds`, `Milliseconds`, `Seconds`, `Degrees`, `Radians`) so the
format's mixed units cannot be confused; `Vector3`, `Matrix3`, `Quaternion` with the rotation
conventions in one place; `GyroViewError` with stable codes; a `TypedEmitter`; a protobuf
reader; `Deferred` and `Signal` for waiting without timers (the core has none).

## The adapters: `packages/adapters`

One package per external technology; none imports another.

- **`node`**: `FileRandomAccessSource` over the file system, for the CLI and Node tests.
- **`fetch`**: `HttpRangeSource` reads byte ranges over HTTP, past the browser's own cache
  (ADR 0013), and reports the server's shortcomings with distinct codes
  (`range-unsupported`, `cors`, `source-unreadable`); `HttpResourceLocator` answers "does it
  exist" with a HEAD, and a one-byte GET where a server refuses HEAD.
- **`blob`**: `BlobRandomAccessSource` slices a `File` from a picker or a drop.
- **`mediabunny`**: the demuxer and track readers over the mediabunny library; an audio track
  opens as `MediabunnyAudioSegments`, its packets re-packaged into fragmented MP4 without
  re-encoding (ADR 0003, ADR 0007). The core never reads audio samples.
- **`webcodecs`**: `WebCodecsVideoDecoderPort`, hardware decoding in the browser with the
  port's key-frame and backpressure contract (ADR 0002).
- **`mse-audio`**: `MediaSourceAudioClock`, a hidden audio element fed through Media Source
  Extensions (`ManagedMediaSource` where it exists), so the recording's own sound is the master
  clock; `SourceBufferFeeder` keeps a window buffered and evicts behind the playhead.
- **`three`**: `ThreeFrameRenderer`, one fullscreen pass per frame with the program of the
  picture the view mode asks for (`pictureMaterials`). The stitch (`stitch.frag.glsl` with the
  `rectilinearRays` or `equirectangularRays` chunk) turns every pixel of the picture's area into
  a ray, applies the view and stabilization rotations, projects through each lens model and
  blends across the feather band; `rawLenses.frag.glsl` copies each lens's frame region into its
  tile. `shaderPrograms` is the only place the order of GLSL chunks is known, `fullscreenPass`
  holds the triangle and material setup every pass shares, and `rendererUniforms` is the only
  place uniform names are spelled (a test checks them against the chunks). `seamMeter/SeamMeterPass`
  is the `SeamMeter`: it renders the seam ring per lens into a tiny target and reads it back.

## The player: `packages/player`

The composition root and the user-facing element, in three layers.

- **`composition`**: `openRecording` is the use case that opens what a `PlayerSource` names,
  following the data: `readRecording`, demux every input, `detectLensLayout` (fetching the
  other lens file of a lone split file when the server has it), calibration required, the decode probe
  (an undecodable recording is an error; nothing plays in its place, ADR 0017), then the core's
  `timeRecording`.
  It depends on `RecordingPorts` (`SourceOpener`, `Demuxer`, `VideoDecoderPort`,
  `ResourceLocator`, a deadline factory), so it is tested against fakes; `browserPorts` supplies
  the real adapters. `buildPipeline` assembles the running parts: the clock (audio or wall),
  the renderer, the stabilizing and gain-matching sinks, the session. The player receives it as a
  `PipelineFactory` and drives the `Pipeline` contract in `composition/ports`, never the
  adapters or the sinks: it sets the stabilization mode and gain matching as commands, which
  the pipeline routes to its sinks and shows at once; `createBrowserPlayer` joins the browser's ports and `buildPipeline` into a `Player`,
  for the element and for pages that want the player alone. Dependency rules keep the adapters
  inside the composition and the composition below the player, and the player below the
  element and the controls.
- **`player`**: `Player`, the headless facade over one loaded recording. It loads, unloads,
  relays the session's states as media-element events (`SessionRelay`, `transportEventsFor`),
  ticks the session
  from a `FrameLoop`, keeps the canvas sized (`DrawingBufferFit`), and owns the settings (view and view
  mode in `PlayerView`, stabilization and gain matching in `PictureSettings`, sound in
  `PlayerSound`, loop) across loads (ADR 0016). Its
  life with a recording is one `PlayerPhase`. The element drives it; the embed bridge drives the element.
- **`element`** and **`controls`**: `GyroViewElement` is `<gyro-view>`: attributes parsed by
  pure functions in `attributes.ts` (names in `attributeNames.ts`, published as
  `@gyroview/player/attributes`), settings properties live over the player (`liveSettings`),
  events re-dispatched as `CustomEvent`s, a shadow tree with the canvas, the audio element,
  poster and overlays. `bindControlsBar` binds `TransportButtons`, the view buttons (Reset view,
  Fullscreen), `SeekBar` (key-frame
  scrubbing), `SoundControls` and `PictureMenus` (the view mode and stabilization menus, each a
  `ChoiceMenu` behind an icon button; stabilization is offered only for a recording with a gyro
  in a stitched view mode). The bar's markup and styles come from `controlsMarkup` and
  `controls.css`, which the element's
  template interpolates, and every icon button draws an SVG from `icons`. `ViewGestures` turns drags,
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
- `snippet/embedSnippet` builds `embed.js`: `GyroView.embed(container, options)` creates the
  iframe and returns a handle. `component.ts` builds `gyro-view.js`, the element as one module.
- `index.html` (`pages/developmentPage`) is the developer page; `dev/samplesPlugin` lists the
  local sample recordings for it.

## Tools and tests

- `tools/insv-inspect`: a CLI that prints what the core understands about a file.
- `tools/fixtures`: assembles the synthetic recordings in `test/fixtures/synthetic` (tiny
  two-track MP4s with a real X5 trailer) that the browser tests play.
- `tools/integration`: end-to-end tests over the real sample recordings, in Node (the core over
  the node adapter) and in real browsers, where they open the samples through the player's
  `openRecording` with its pipeline settings, so they exercise the real composition; they skip
  when the samples are absent.

Tests follow the layers: pure domain tests run in Node in milliseconds and are mutation-tested
with Stryker; adapters have contract tests against their ports and run in Chromium and WebKit
where they need a browser; the player and the site are tested in browsers over the synthetic
recordings; the integration suite adds the real files. `pnpm measure` also writes its renders
to `.artifacts/` and runs the measurements behind a camera's constants (the IMU frame ranking).

## Two flows

**Opening and playing a recording.** `<gyro-view src>` → `Player.load` → `openRecording`
(bytes through `SourceOpener`, `readRecording`, demux, layout, calibration, probe, timing,
motion) → `buildPipeline` (clock, `ThreeFrameRenderer`, `StabilizingFrameSink`,
`GainMatchingFrameSink`, `PlaybackSession`) → `ready` event → `preload` shows the first frame → `play` → the session
starts a `DecodePipeline`, waits in `buffering` for two pairs, starts the clock → on each
animation frame `tick` takes the pair due, the stabilizing sink sets the rotation for its
mid-exposure orientation, the renderer uploads the frames and draws one stitched pass; every
half second the gain-match pass measures the seam and adjusts the lens gains.

**Embedding.** `GyroView.embed` builds the frame URL from the options and this page's origin,
creates the iframe and an `EmbedHandle` listening only to the frame; the frame's `EmbedHost`
says `hello` with the element's state, which the handle's mirror starts from, then runs
validated commands on its element and forwards the element's events as plain data.

## Rules that keep it this way

- The dependency rule is enforced by `.dependency-cruiser.cjs`; `core` may not import anything.
- Variants of the format (trailer wrapper, record locator, gyro layout, calibration version,
  lens layout, frame-time source, stabilization mode, IMU frame) are strategies selected from
  data in the file, never from the camera model string alone (ADR 0004).
- Units are branded types; rotations have one convention module; errors are `GyroViewError`s
  with stable codes; optional data is modelled as absence, required data missing is an error.
- Every decision that is not obvious from the code has an ADR; every concept has one name, in
  `docs/GLOSSARY.md`.
