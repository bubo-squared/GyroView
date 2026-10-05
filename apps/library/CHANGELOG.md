# Changelog

What changed for a page using the package, newest first. Until 1.0, a minor version may change
the API.

## Unreleased

Changed (ADR 0042, the player keeps a media element's promises):

- `seeked` comes once the first picture at the new position is drawn, as a video's does, rather
  than the moment the seek was asked for; meanwhile the status is `seeking`, which pages could
  not see before. A seek made while playing goes on playing after that picture, so `playing`
  follows `seeked`. The spinner shows only once a seek or a wait has lasted 0.3 seconds.
- At its natural end a recording fires `timeupdate`, `pause`, then `ended`; a page driving its
  own play button from `play` and `pause` now sees it stop. With `loop`, the recording goes back
  to the start without `ended`, `play`, `pause` or a buffering status at each turn.
- `play()` resolves once playback runs. It rejects with the new `usage` codes `no-source` when
  nothing is loaded or loading, and `play-interrupted` when a newer load, `unload()` or the
  element's removal replaces the load it waited for; out of the document it waits for the
  connection and the load that starts. A `play()` made while buffering after a seek resolves
  once the clock runs.
- `load()` with `autoplay` resolves once the recording is ready; autoplay starts it then, a
  refusal still a warning.

Fixed:

- Split recordings (two files, older cameras): the file that carries the trailer is lens 0, so
  files renamed, or served from URLs that hide `_00_` and `_10_`, are no longer stitched with
  the lenses swapped. Names only break a tie.
- Gain matching keeps the exposure of the lens the view opens facing, as ADR 0012 intends; since
  0.5.0 (ADR 0039) it kept the lens behind the viewer and re-exposed the view in front. It also
  compares the lenses only where neither is blown out, so flare in one lens no longer brightens
  the other's whole hemisphere.
- On a portrait screen the normal view spans at most 120 degrees from top to bottom; it spanned
  up to 150, its edges stretched. `fov` still gives the field across.
- A zoom toward the pointer keeps that point under the pointer in a rolled view (motion look).
- A read-ahead range that failed during a short network outage is asked for again once
  playback needs it, instead of failing playback later with `source-unreadable`.
- Audio the browser evicts at the playhead, as a managed media source may, is fetched again, and
  a full sound buffer makes room, instead of freezing the picture or failing.
- Lens tracks whose frames never pair fail with `unsupported-layout` instead of playing to the
  end over a still picture.
- A scrub or seek to a key frame shows it at once; WebCodecs' whole-microsecond timestamps had
  it waiting for the next frame.
- A seek or scrub closes the previous decoders at once, instead of keeping them open beside the
  new ones for a moment at every step of a drag.
- A canvas whose WebGL context the browser took away fails the next load with
  `render-unavailable` (the browser's side) instead of `invariant-violation`, and a frame larger
  than the GPU's largest texture is refused with it instead of being shrunk on the CPU at every
  upload.
- After a lost context comes back, every shader is compiled at once, so switching view modes
  stays instant.
- The letterbox bars around a fitted picture are cleared, not stitched and painted black.
- An HLG recording's colours past white are read as white, not brighter.
- Damaged or hostile files fail with the recording's own codes (ADR 0030) instead of hanging,
  exhausting memory or blaming the player: sample tables counting billions of samples, a
  timescale of zero, a malformed sync sample table, a picture track without a decoder
  configuration (`unsupported-container`, was `codec-unsupported`).
- A metadata track the player does not play, an info field it only reports, or a calibration
  string that parses but fits no camera no longer keeps a recording from opening; the next
  calibration string is used.
- Gyro slots a camera never wrote no longer add a "damaged gyro samples" warning to `ready`.
- An HEVC sample with an empty NAL unit is no longer mistaken for a delta frame.

## 0.6.1 (2026-10-05)

Fixed:

- Where the browser has no fullscreen for the element (iPhone Safari), the pinned player covers
  the whole viewport from inside a modal, a carousel or any container with a transform, a filter
  or containment: it is shown in the top layer, as the browser's own fullscreen is (ADR 0041).
  It filled only that container, and the page showed around it. It also stays above the page's
  own layers, whatever their `z-index`, and keeps none of the page's corners, `translate`,
  `rotate` or `scale` for it.

What a page may notice:

- While pinned, the element has `popover="manual"` beside `data-fill`; a page never sets the
  attribute itself. A popover or dialog the page opens meanwhile shows above it, as over the
  browser's fullscreen. Where the browser has no popovers of its own (Safari before 17), the
  element is pinned in place as before.
- While pinned, the element's background, colour, font and overflow are its own: a page's styles
  for every `[popover]`, and the page's own `background`, `color` or `font-family` on
  `gyro-view`, no longer reach it; the `--gyro-view-*` properties still theme it. A page's
  shadow or opacity for every popover would.
- An element the page removes while pinned leaves the fill, as one in the browser's fullscreen
  does. One it moves within the same task, taken out and put back before a microtask runs, stays
  pinned.

## 0.6.0 (2026-10-05)

New:

- Motion look: on a phone or tablet, a toggle in the normal view lets the device turn the view, the
  screen a window into the recording with its horizon level with the real one (ADR 0040). The
  element and the player have `motionLook` (`on`, `off` or `unavailable`), `startMotionLook()`,
  which iOS honours only from a tap's handler, and `stopMotionLook()`; `motionlookchange` reports
  it, and the warnings `motion-look-refused` and `motion-look-needs-gesture` say why it did not
  start.

What a page may notice:

- `PlayerEvents`, `GyroViewElementEventMap` and `WarningCode` have the new event and codes; a
  record keyed on every event or code needs them.
- `view` and `viewchange` give a fresh object of `yaw`, `pitch` and `fieldOfView` each time.
- The iframe the snippet creates allows `accelerometer; gyroscope; magnetometer`; a hand-written
  iframe needs them for motion look. Without them, Chromium offers no toggle; iOS offers it and
  refuses at the first press (`motion-look-refused`).
- On the narrowest players with the motion look toggle shown, the Stabilization menu gives way
  to it.

## 0.5.0 (2026-10-03)

New:

- Antigravity A1 recordings play. The A1 leaves the profile, tier and level of its HEVC
  configuration blank, so the codec string is read from the stream's SPS instead (ADR 0037), and
  its IMU frame is measured (ADR 0009): the `ready` event's `imuFrame` is
  `{ name: 'A1', isVerified: true }`.

What a page may notice:

- An HEVC recording's codec in the `ready` event's `tracks[].codec` begins with the track's
  sample entry type, `hvc1` on every camera seen, where it began with `hev1`; its profile, tier
  and level are unchanged (ADR 0037).
- `off` and `follow` stand a recording upright as its camera stood, where its IMU frame is
  measured (ADR 0038). An X3, X4 Air, X5 or X6 held upright on a stick or a tripod, its usual
  pose, holds its body frame a quarter turn from upright, and these modes drew its recordings
  turned a quarter turn; a camera upside down or with its lens axis vertical stands upright too.
  Under `horizon`, such a camera's view keeps its heading while the camera pitches.
- An Insta360 X3 recording is stabilized about the right axes: its IMU frame is measured
  (ADR 0009). The `ready` event's `imuFrame` is `{ name: 'X3', isVerified: true }` where it was
  the unverified aligned frame, the load no longer warns that it has not been verified, and an
  X3 on a stick or a tripod stands upright in `off` and `follow` too.
- An Insta360 ONE RS recording stands upright under `lock` and `horizon`, which turned it on its
  side. Its IMU frame is assumed from one recording of a camera that never turned: `imuFrame` is
  `{ name: 'ONE RS (unverified)', isVerified: false }`, and the load still warns.
- The view opens where Insta360 Studio centres the recording, in every mode: a half turn from
  lens 0, where it opened, for a camera whose lens axis lies level, and a quarter turn from lens 0
  for one whose lens axis is vertical, as the A1's (ADR 0038, ADR 0039). `yaw` 0 looks there: a
  page that set `yaw` to face a direction faces the opposite one on a level camera until it adds
  180 degrees. The equirectangular panorama is centred as Studio's export is.

## 0.4.2 (2026-10-02)

What a page may notice:

- Dragging, pinching or turning the wheel over a playing recording draws the picture once per
  animation frame: in Safari, a fast mouse no longer slows the recording down. A change of the
  view, the view mode, the quality or the exposure matching shows at the next animation frame
  rather than at the call (ADR 0035).
- Opening a recording keeps the page busy for less time: its gyro is read and integrated in two
  thirds of the time.
- Playing takes less of the page's main thread: the download plans what to fetch every few
  mebibytes rather than at every frame (ADR 0036).
- A bundle that includes the package is smaller: mediabunny's demuxers for formats other than
  MP4 and QuickTime are left out. The standalone module is about 40 KB smaller compressed.

## 0.4.1 (2026-10-01)

What a page may notice:

- An Insta360 X4 Air recording is stabilized about the right axes: its IMU frame is measured
  (ADR 0009) where it was assumed. The `ready` event's `imuFrame` is
  `{ name: 'X4 Air', isVerified: true }` where it was the unverified aligned frame, and the load
  no longer warns (`recording-degraded`) that the IMU frame has not been verified on a recording.
- A camera is given a measured IMU frame only by its whole model name: a model whose name merely
  begins with a measured camera's, such as a later "X5 Pro", gets the unverified frame and its
  warning until a recording of it is measured.

## 0.4.0 (2026-10-01)

New:

- Insta360 X6 recordings play. Their only calibration is a v6 string, now read as the Mei model
  with more terms (ADR 0032); the X6's IMU frame and the radial scale its lenses want are
  measured (ADR 0009, ADR 0023); and its 10-bit HLG video is shown as SDR, as Insta360 Studio
  shows it (ADR 0033).
- Each of the `ready` event's `tracks` has a `colour`: its primaries, transfer, matrix and range
  as the track's bitstream says (`TrackColour`, with the types `ColourPrimaries`,
  `TransferCharacteristics`, `MatrixCoefficients` and `ColourRange`).
- `inspectRecording`'s calibration strings include `offsetV6`, and `calibrationVersion` may be
  6, the v6 string's.

What a page may notice:

- A recording whose only calibration is a v6 string plays where it failed with
  `no-calibration`.
- Stabilization samples the gyro half way through each frame's shutter, no longer half a
  readout later. An X5's stabilized picture shifts by that half readout (4 ms at 5.7K60, 10.6 ms
  at 8K30), and a swinging camera's world holds stiller (ADR 0034).
- A track whose colour the player cannot show as it should is drawn with a
  `recording-degraded` warning: a PQ or linear-light transfer is drawn as recorded, SDR of wider
  primaries than BT.709's is shown as BT.709, HLG of primaries other than BT.709's or BT.2020's
  keeps its gamut.
- The decoder is told the track's whole colour, not only its range (the range alone where the
  browser's WebCodecs does not know one of its values).
- Where a browser's decoder converts a track's colour through another matrix than the track's
  own, as Safari's does with the X6's BT.2020, the picture is brought back to the track's.
- Seeking again and again, or dragging the seek bar, no longer stops playback now and then with
  `decode` ("the audio element failed (media error 3)"): the sound is handed to the browser in
  whole segments, so a seek can no longer cut one in half.

## 0.3.1 (2026-09-30)

New:

- Every error has a `category`, derived from its code, that says whose side the failure is on:
  `browser`, `recording`, `source`, `usage` or `internal`; `GYRO_VIEW_ERROR_CATEGORIES` and the
  type `GyroViewErrorCategory` list them. The README's "When a recording cannot play" gives the
  codes of each, and what a `<video>` fallback can and cannot do (ADR 0030).
- The `webcodecs-unavailable` error: the browser has no WebCodecs, on a page not served over
  HTTPS or in an old browser.

What a page may notice:

- A page on plain HTTP, or a browser without WebCodecs, hears `webcodecs-unavailable` where it
  heard `codec-unsupported`, whose message blamed the codec.

## 0.3.0 (2026-09-30)

What a page may notice:

- A recording named by URL is downloaded in file order as it plays, the picture and the sound
  from the same bytes, each fetched about once (ADR 0029). Over a simulated link a little
  slower than an X5 recording at its highest setting (200 Mbit/s against 210), it starts in
  half the time, fetches under half the bytes, and after a seek shows the target in half the
  time, asking for nothing of the old position.

  | State                  | What it downloads                                                     |
  | ---------------------- | --------------------------------------------------------------------- |
  | Loaded, never played   | What opening and the first frame need; with `preload="none"` no frame |
  | Playing                | Up to 10 s or 128 MiB ahead, whichever is less, topped up as it plays |
  | Paused after playing   | On up to that budget, then nothing                                    |
  | A seek                 | The old position's requests end at once; the target first             |
  | Starved by the network | Waits until the next 4 s are downloaded, then plays on                |

- A range that breaks off or brings nothing for 10 s is asked for again from its next byte.

New:

- The `source-changed` error: the recording at the URL was replaced while it played, as its
  `ETag` tells, or else its `Last-Modified` and size. Exposing `ETag` across origins is
  optional, and now named in the CORS advice.

## 0.2.0 (2026-09-29)

What a page may notice:

- The controls are restyled, and fit the player's own width and the pointer (ADR 0028): a
  shaded bar with a thin seek bar, Stabilization and View buttons that show the icon of the
  choice in effect and open menus of the choices with their icons and a line describing each,
  and on a narrow player menus over the whole player and fewer parts; on touch, 44-pixel
  targets.
- The Stop button is gone; `stop()` and the S key remain. `labels.stop` goes with it.
- The theme's defaults follow the new look: `--gyro-view-accent` and `--gyro-view-text` are
  white, `--gyro-view-controls-background` is `rgb(0 0 0 / 60%)` and `--gyro-view-radius` is
  `8px`; `--gyro-view-menu-background` is new. A page's own values keep working.

New:

- `crossorigin` on `<gyro-view>`, with a media element's keywords: `use-credentials` fetches the
  recording, its byte ranges and the other lens's file of a split pair with the visitor's
  cookies, for recordings kept private behind cookies on another origin. `crossOrigin` reflects
  it, `null` while absent. Changing it reloads a recording named by URL; the iframe embed never
  carries it. Nothing changes for a page that does not set it.
- `credentials` on a `UrlInput` (`player.load({ main: { url, credentials: 'include' } })`), in
  place of the player's shared `http.requestInit.credentials` for that recording.
- A `cors` error for a request sent with credentials names what the host must add: the page's
  origin by name, not `*`, and `Access-Control-Allow-Credentials: true`.
- The equirectangular panorama and the raw lenses zoom up to eight times, from four, for fine
  detail in 5.7K and 8K recordings. The normal view keeps its 30 to 120 degrees.
- `messages` takes `stabilizationModeDescriptions`, `viewModeDescriptions` and `labels.close`.

Fixed:

- The raw lenses no longer show a faint grey line along the tiles' edges on Apple GPUs, where a
  player's size put an edge between two pixels the GPU shades together.

## 0.1.0 (2026-09-29)

The first release:

- `<gyro-view>`, registered by `@bubo-squared/gyroview/define` or `defineGyroView()`, safe to
  import while a server renders the page. It runs under a strict CSP (`trusted-types gyroview`,
  no inline styles), speaks the page's language through `messages`, shows visitors plain failure
  texts and names its overlays as parts. It opens on the raw lenses; the view menu offers them
  first, then the equirectangular panorama and the normal view. The stitch reads the legacy
  calibration string's radius as 96 degrees from the lens axis, where Insta360 Studio's own stitch
  puts the far field; `ready` reports `offset` as the calibration version. The lens pose reads
  the calibration's roll mirrored and turns both lenses alike by their yaw and pitch, which
  removes the step at the side seams of the X5 recordings. The `quality`
  attribute (`fast`, `balanced`, `high`, listed in `PICTURE_QUALITIES`, with `setQuality` and
  `qualitychange`) sets how finely
  the lens images are read and how many device pixels are drawn; `balanced` reads them through a
  mip chain along each pixel's footprint, so fine detail no longer shimmers.
- `createBrowserPlayer`, the player without the element, for an interface of your own, with
  `attachViewGestures` and `attachKeyboard` for the element's gestures and shortcuts.
- `inspectRecording`, which reads what a recording holds from a file or a URL.
- `@bubo-squared/gyroview/standalone`, one file with Three.js and mediabunny inside, for a page
  without a bundler.
- Events in media-element terms, each `warning` with a `code` a page can act on beside its
  message; times, durations and views in plain seconds and degrees.
- `GyroViewError` and its codes (`GYRO_VIEW_ERROR_CODES`), and the types of the settings,
  metadata, events and inspection, with `GyroViewAttributes` for a framework's JSX declaration
  of the element.
