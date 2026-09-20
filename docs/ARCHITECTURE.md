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

| Layer               | Package(s)                                                                 | May import                          |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| Domain, application | `packages/core`                                                            | nothing outside itself              |
| Infrastructure      | `packages/adapters/{node,fetch,blob,mediabunny,webcodecs,mse-audio,three}` | `core` and one library each         |
| Composition, UI     | `packages/player`                                                          | `core`, every adapter               |
| Sites               | `apps/embed`                                                               | `player` (and `core` types)         |
| Tools               | `tools/*`                                                                  | `core`; `integration` also adapters |

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
- `info/parseInfoRecord` decodes the protobuf info record into `RecordingInfo`: camera, firmware,
  calibration strings, timing fields, layout hints. Absent fields are `undefined`.
- `records/gyro` parses IMU samples in the raw (20-byte) or float (56-byte) layout, selected by
  the info record or inferred from the bytes; `records/exposure` parses per-frame shutter times.
- `layout/detectLensLayout` decides how the lens images are stored from the tracks actually
  present: multi-track (one file, two tracks), split files (`_00_` and `_10_`) or packed (both
  circles in one frame). The info record is only a hint.
- `naming/RecordingFileName` understands `VID_<date>_<time>_<lens><proxy>_<seq>.insv` to guess
  where companion files live; the guess is always verified against the file.

**`optics`: lenses and calibration.** `parseOffsetString` turns the three generations of
calibration strings (`offset`, `offset_v2`, `offset_v3`) into a `CalibrationSet`; each lens
has a `LensModel` strategy (`MeiModel`, `PolynomialModel`, `EquidistantModel`) that maps a
direction to a canvas pixel and also exposes its parameters for the shader. `lensPose` gives
the body-to-lens rotation from the calibration's yaw, pitch and roll (ADR 0008). `gainMatch`
holds the exposure-matching model (ADR 0012).

**`motion`: time and orientation.** `CaptureClock` relates the camera's microsecond clock to
video time. `FrameTimes` and the `FrameTimeSource` strategies (exposure record, track
timestamps, nominal rate) give every frame its mid-exposure instant. `GyroTrack` is the IMU
record as a structure of arrays; `ImuFrame` says how the IMU's axes sit in the camera body
(measured per camera, ADR 0009); `OrientationTrack.integrate` turns gyro and accelerometer
into a body-to-world quaternion per sample (bias from the stillest window, gravity pull). The
`Stabilizer` strategies (`off`, `lock`, `horizon`, `follow`) turn an orientation into the
rotation the renderer applies.

**`playback`**: `PlayerStateMachine` with the exhaustive transition table
(`ready`, `playing`, `buffering`, `paused`, `seeking`, `ended`, `error`, `disposed`) and the
`WallClock` used when a recording has no audio.

**`view`**: `ViewState` (yaw, pitch, field of view, projection) with clamping, the view
rotation, the pure drag/zoom/look-at gestures, and the equirectangular mapping used by tests.

### Application: `core/src/application`

Use cases that orchestrate the domain through ports.

- `recording/readRecording` opens a `RandomAccessSource` and reads everything cheap: boxes,
  trailer, info record, calibration choice. The result, `Recording`, reads the large gyro and
  exposure records on demand. `locateCompanions` looks for the proxy and the other lens file.
- `playback/LensDecodePipeline` runs one lockstep decode of all lens tracks from a time: one
  decoder per track, packets fed under backpressure, frames paired by timestamp
  (`FramePairer`), pairs before the start dropped by the `StartGate`, output into a
  `FramePairQueue`.
- `playback/PlaybackSession` is the transport: it drives a pipeline in step with a
  `PlaybackClock`, presents the pair due at each tick to a `FrameSink`, and owns the state
  machine. Sound follows the picture: playback waits in `buffering` until two pairs are queued,
  after a seek, and whenever the decoders fall behind (ADR 0011). It also offers `preload`
  (first frame while ready) and `scrub` (seek to the key frame at or before a time).
- `playback/probeDecoding` decodes the first key frame of every lens track under a deadline
  before anything else is built, because platforms say yes to codecs they then fail on.
- `stitching/StitchingSetup` joins calibration, layout and sensor window into the per-lens
  numbers a renderer binds; `StabilizingFrameSink` wraps a `StabilizableFrameSink` and sets the
  stabilization rotation for each frame's mid-exposure orientation before presenting it.

### Ports: `core/src/ports`

| Port                 | What the core needs                                          | Implementations                                                       |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `RandomAccessSource` | `size()`, `read(ByteRange)`                                  | `FileRandomAccessSource`, `HttpRangeSource`, `BlobRandomAccessSource` |
| `Demuxer`            | open a container, list `VideoTrackReader`/`AudioTrackReader` | `MediabunnyDemuxer`                                                   |
| `VideoDecoderPort`   | create decoders that emit frames and apply backpressure      | `WebCodecsVideoDecoderPort`                                           |
| `PlaybackClock`      | current time, start/pause/seek, end and failure              | `MediaSourceAudioClock`, core `WallClock`                             |
| `AudioSegmentSource` | the audio track as fragmented MP4 segments from a time       | `MediabunnyAudioSegmenter`                                            |
| `FrameSink`          | present a frame pair (`StabilizableFrameSink` adds rotation) | `ThreeFrameRenderer`                                                  |
| `ResourceLocator`    | does this URL exist                                          | `HttpResourceLocator`                                                 |

Every port has a fake in `core/src/testing` and a contract test that runs against the fake and
the real adapter alike.

### Shared: `core/src/shared`

Branded units (`Microseconds`, `Milliseconds`, `Seconds`, `Degrees`, `Radians`) so the
format's mixed units cannot be confused; `Vector3`, `Matrix3`, `Quaternion` with the rotation
conventions in one place; `GyroViewError` with stable codes; a `TypedEmitter`; a protobuf
reader; `Deferred` and `Signal` for waiting without timers (the core has none).

## The adapters: `packages/adapters`

One package per external technology; none imports another.

- **`node`**: `FileRandomAccessSource` over the file system, for the CLI and Node tests.
- **`fetch`**: `HttpRangeSource` reads byte ranges over HTTP and reports the server's
  shortcomings with distinct codes (`range-unsupported`, `cors`, `source-unreadable`);
  `HttpResourceLocator` answers "does it exist" with one HEAD.
- **`blob`**: `BlobRandomAccessSource` slices a `File` from a picker or a drop.
- **`mediabunny`**: the demuxer and track readers over the mediabunny library, and
  `MediabunnyAudioSegmenter`, which re-packages the AAC track into fragmented MP4 without
  re-encoding (ADR 0003, ADR 0007).
- **`webcodecs`**: `WebCodecsVideoDecoderPort`, hardware decoding in the browser with the
  port's key-frame and backpressure contract (ADR 0002).
- **`mse-audio`**: `MediaSourceAudioClock`, a hidden audio element fed through Media Source
  Extensions (`ManagedMediaSource` where it exists), so the recording's own sound is the master
  clock; `SourceBufferFeeder` keeps a window buffered and evicts behind the playhead.
- **`three`**: `ThreeFrameRenderer`, one fullscreen pass of `stitch.frag.glsl` that turns
  every pixel into a ray (rectilinear, stereographic or equirectangular), applies the view and
  stabilization rotations, projects through each lens model and blends across the feather band.
  `stitchUniforms` is the only place uniform names are spelled. `gainMatch/GainMatchPass`
  renders the seam ring per lens into a tiny target and `GainMatching` feeds the core's
  `GainMatcher` with the read-back.

## The player: `packages/player`

The composition root and the user-facing element, in three layers.

- **`composition`**: `openRecording` is the use case that opens what a `PlayerSource` names,
  following the data: `readRecording`, demux every input, `detectLensLayout` (fetching the
  sibling of a lone split file when the server has it), calibration required, the decode probe
  with fallback to the proxy when `quality` allows, `frameTimesFor` (exposure record first, the
  sample table only if needed), `motionSetupFor` (gyro integration with the camera's IMU frame).
  It depends on `RecordingPorts` (`SourceOpener`, `Demuxer`, `VideoDecoderPort`,
  `ResourceLocator`, a deadline factory), so it is tested against fakes; `browserPorts` supplies
  the real adapters. `buildPipeline` assembles the running parts: the clock (audio or wall),
  the renderer, the stabilizing sink, the session.
- **`player`**: `Player`, the headless facade over one loaded recording. It loads, unloads,
  relays the session's states as media-element events (`transportEventsFor`), ticks the session
  from a `FrameLoop`, keeps the canvas sized (`Viewport`), and remembers view, stabilization and
  gain-matching settings across loads. The element and the embed bridge both drive it.
- **`element`** and **`controls`**: `GyroViewElement` is `<gyro-view>`: attributes parsed by
  pure functions in `attributes.ts`, mirrored as properties, events re-dispatched as
  `CustomEvent`s, a shadow tree with the canvas, the audio element, poster and overlays.
  `ControlsBar` binds the control bar (transport, seek bar with key-frame scrubbing, sound,
  settings menu, fullscreen); `ViewGestures` turns drags, pinches and wheel turns into view
  changes; `KeyboardBinding` maps keys to commands; `FullscreenToggle` and `IdleWatcher` handle
  filling the screen and fading the controls.

## The site: `apps/embed`

- `embed.html` (`pages/embedPage`) puts a full-viewport `<gyro-view>` up from its query string
  and, when embedded, bridges to the embedding page.
- `protocol/` is the versioned `postMessage` vocabulary (`hello`, `command`, `result`, `event`),
  validated on receipt, with the origin rules. `bridge/EmbedHost` runs commands on the element
  and forwards its events; `bridge/EmbedHandle` is the embedding page's side, the player API as
  promises with a state mirror; both talk through an `Endpoint` (a window pair in production, a
  `MessagePort` in tests). ADR 0010.
- `snippet/embedSnippet` builds `embed.js`: `GyroView.embed(container, options)` creates the
  iframe and returns a handle. `component.ts` builds `gyro-view.js`, the element as one module.
- `index.html` (`pages/developmentPage`) is the developer page; `dev/samplesPlugin` lists the
  local sample recordings for it.

## Tools and tests

- `tools/insv-inspect`: a CLI that prints what the core understands about a file.
- `tools/fixtures`: assembles the synthetic recordings in `test/fixtures/synthetic` (tiny
  two-track MP4s with a real X5 trailer) that the browser tests play.
- `tools/integration`: end-to-end tests over the real sample recordings, in Node and in real
  browsers; they skip when the samples are absent.

Tests follow the layers: pure domain tests run in Node in milliseconds and are mutation-tested
with Stryker; adapters have contract tests against their ports and run in Chromium and WebKit
where they need a browser; the player and the site are tested in browsers over the synthetic
recordings; the integration suite adds the real files and writes renders to `.artifacts/`.

## Two flows

**Opening and playing a recording.** `<gyro-view src>` → `Player.load` → `openRecording`
(bytes through `SourceOpener`, `readRecording`, demux, layout, calibration, probe, timing,
motion) → `buildPipeline` (clock, `ThreeFrameRenderer`, `StabilizingFrameSink`,
`PlaybackSession`) → `ready` event → `preload` shows the first frame → `play` → the session
starts a `LensDecodePipeline`, waits in `buffering` for two pairs, starts the clock → on each
animation frame `tick` takes the pair due, the stabilizing sink sets the rotation for its
mid-exposure orientation, the renderer uploads the frames and draws one stitched pass; every
half second the gain-match pass measures the seam and adjusts the lens gains.

**Embedding.** `GyroView.embed` builds the frame URL from the options and this page's origin,
creates the iframe and an `EmbedHandle` listening only to the frame; the frame's `EmbedHost`
says `hello`, then runs validated commands on its element and forwards the element's events as
plain data.

## Rules that keep it this way

- The dependency rule is enforced by `.dependency-cruiser.cjs`; `core` may not import anything.
- Variants of the format (trailer wrapper, record locator, gyro layout, calibration version,
  lens layout, frame-time source, stabilization mode, IMU frame) are strategies selected from
  data in the file, never from the camera model string alone (ADR 0004).
- Units are branded types; rotations have one convention module; errors are `GyroViewError`s
  with stable codes; optional data is modelled as absence, required data missing is an error.
- Every decision that is not obvious from the code has an ADR; every concept has one name, in
  `docs/GLOSSARY.md`.
