# GyroView

Browser player for raw `.insv` recordings of Insta360 cameras (X3, X4, X5, X6, ONE RS) and the
Antigravity A1. It plays the camera's dual-fisheye files directly as a 360 video, stitched and
gyro-stabilized on the GPU, and embeds on any website as a `<gyro-view>` web component or an
iframe. No Insta360 Studio export step.

**Only want to watch a recording?** [insv-player.com](https://insv-player.com/) is GyroView as
a free website: drop an `.insv` file or paste a link to one, and it plays in the browser.
Nothing is uploaded, and there is nothing to install or embed.

## Features

- Plays the raw file at full resolution over HTTP byte ranges or from a local file; the second
  lens file of a split-file recording is found beside it when it exists.
- Decodes both lens tracks in hardware with WebCodecs, in lockstep, with the recording's own
  audio as the clock; sound waits for the picture rather than running ahead.
- Stitches through the factory calibration in one GPU pass, with a feathered seam and
  exposure matching between the lenses; a normal view to look around in, the whole sphere as
  an equirectangular panorama, or the two lens images raw, side by side or stacked.
- Stabilizes from the gyro: lock, horizon or follow, sampled at each frame's mid-exposure.
- On a phone or tablet, motion look turns the normal view as the device turns: the screen is a
  window into the recording, its horizon level with the real one.
- Ships as the npm package `@bubo-squared/gyroview`, as an element (`gyro-view.js`) and as an
  iframe (`embed.html` plus `embed.js`) with the same API and events.

Verified on Insta360 X5 recordings and one recording each of the X3, X4 Air, X6, ONE RS and
Antigravity A1; other cameras' format variants are implemented from documentation and covered by
synthetic fixtures. [The roadmap](docs/ROADMAP.md) says exactly what is verified, what is waiting
on real files or devices, and what could come next.

## Using the player

Both ways play a recording from a URL whose server answers byte ranges (see "Serving
recordings").

### As an element

In a project with a bundler, install the [npm package](apps/library/README.md):

```sh
npm install @bubo-squared/gyroview
```

```ts
import '@bubo-squared/gyroview/define'; // registers <gyro-view>
```

Without a bundler, load the package's standalone file (Three.js and mediabunny inside) from
a CDN or your own host; the site build's `gyro-view.js` is that file under another name:

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@bubo-squared/gyroview@0.7/dist/standalone.js"
></script>

<gyro-view
  src="https://media.example/VID_20260814_132640_00_013.insv"
  stabilization="lock"
  controls
  muted
></gyro-view>
```

Attributes:

| Attribute                   | Values                                    | What it does                                                                                                              |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src`                       | URL                                       | The recording; a relative URL resolves against the page.                                                                  |
| `src2`                      | URL                                       | The other lens's file of a split-file recording; found by itself when it sits beside `src` under the camera's name.       |
| `crossorigin`               | `anonymous`, `use-credentials`            | As on a video element: `use-credentials` fetches the recording with the visitor's cookies (see "Serving recordings").     |
| `autoplay`                  | boolean                                   | Starts once ready; a refusal is an `autoplay-blocked` warning.                                                            |
| `muted`, `loop`, `controls` | boolean                                   | As on a video element; `controls` shows the bar.                                                                          |
| `poster`                    | URL                                       | Shown until the first picture.                                                                                            |
| `preload`                   | `auto`, `none`                            | `none` keeps the decoders idle until play; otherwise the first frame shows at once.                                       |
| `gain-match`                | `on`, `off`                               | `off` leaves the lenses' exposure as recorded.                                                                            |
| `stabilization`             | `off`, `lock`, `horizon`, `follow`        | How the gyro steadies the picture.                                                                                        |
| `view-mode`                 | `raw-lenses`, `equirectangular`, `normal` | What the picture shows (below); the raw lenses until set.                                                                 |
| `quality`                   | `fast`, `balanced`, `high`                | How finely the lens images are read and how many device pixels are drawn (below); `balanced` until set.                   |
| `fov`                       | 30 to 120                                 | The normal view's horizontal field of view, in degrees; a taller player spans 120 top to bottom at most.                  |
| `yaw`, `pitch`              | degrees                                   | Where the normal view looks: yaw positive to the right, pitch positive up; 0 where Insta360 Studio centres the recording. |

The element opens on `raw-lenses`, the decoded lens images side by side or stacked, whichever
shows them larger, unstitched and as recorded; the camera records a square a little smaller
than each lens's image circle, so the circles show cut at the frame's edges, where the two tiles
meet as well. `equirectangular` shows the whole sphere as a level 2:1 panorama, and `normal` a
window into it to look around in. The view menu offers the three in that order.

The `quality` sets how the lens images, larger than the picture on most screens, are read:
`fast` takes one bilinear sample per pixel and draws one device pixel per CSS pixel, cheapest
and prone to shimmer on fine detail; `balanced` reads the lens images through a mip chain along
the footprint of each drawn pixel and follows the screen's pixel ratio up to two; `high` adds
four samples on a rotated grid per pixel and follows the ratio up to three. The setting is kept
across loads.

The settings (`stabilization`, `view-mode`, `quality`, `fov`, `yaw`, `pitch`, `muted`, `loop`)
are applied when their attribute changes, and their properties (`viewMode` for `view-mode`,
plus `volume`) report and change the setting in effect, as a video's `muted` property does, however
it was last changed. The other attributes are mirrored by properties (`gainMatch` for
`gain-match`, `crossOrigin` for `crossorigin`); `preload` and `gainMatch` read the keyword in
effect, and `crossOrigin` reads `null` while its attribute is absent, as a video's does.

Methods and properties:

| Member                                                | What it does                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `load()`                                              | Resolves once ready, `autoplay` starting it after; an element out of the page loads once connected.               |
| `loadFiles({ main, second })`                         | Plays local files in place of `src`, until `src` or `src2` change.                                                |
| `play()`, `pause()`, `stop()`                         | As a video's; `play()` waits for a load in progress or a connection, and resolves once it plays.                  |
| `seek(seconds)`, `currentTime`                        | Seeks exactly.                                                                                                    |
| `scrub(seconds)`                                      | Seeks to the key frame at or before the time: quick to show while a seek bar is dragged.                          |
| `duration`, `paused`, `status`, `metadata`            | What is loaded and where playback is.                                                                             |
| `view`, `lookAt(yaw, pitch)`, `resetView()`           | Where the normal view looks.                                                                                      |
| `motionLook`, `startMotionLook()`, `stopMotionLook()` | Motion look (below): `on`, `off` or `unavailable`; start it from a tap's handler.                                 |
| `zoom(steps, focus?)`                                 | Zooms toward a point of the picture given as fractions of its size, or about the centre.                          |
| `setViewMode(mode)`, `setStabilization(mode)`         | As the attributes; an unknown mode is refused.                                                                    |
| `setQuality(quality)`                                 | As the attribute; an unknown quality is refused.                                                                  |
| `volume`                                              | 0 to 1, where the platform lets a page set it.                                                                    |
| `messages`                                            | Every word the element shows (below).                                                                             |
| `fetch`                                               | A page's function in place of `fetch` for the recording's requests, to add a token (see "Serving recordings").    |
| `toggleFullscreen()`                                  | Fills the screen through the Fullscreen API or, where it cannot, pins the element over the page in the top layer. |

Events, each a `CustomEvent` with its payload in `detail`, typed in `GyroViewElementEventMap`:

| Event                                                 | `detail`                  | When                                                                                                                 |
| ----------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ready`                                               | metadata                  | The recording is ready: camera, layout, calibration version, frame time source, gyro and IMU frame, audio, duration. |
| `statuschange`                                        | status                    | `idle`, `loading`, `ready`, `playing`, `buffering`, `paused`, `seeking`, `ended` or `error`.                         |
| `play`, `playing`, `waiting`, `pause`, `ended`        | none                      | As a video's: `pause` comes before `ended`, and a `loop` seeks to the start, never ending.                           |
| `timeupdate`                                          | seconds                   | Every quarter second of playback, and on a pause, a seek or the end.                                                 |
| `seeking`, `seeked`                                   | seconds                   | Around a seek; `seeked` once the picture there is drawn, the status `seeking` until then.                            |
| `frame`                                               | seconds                   | Right after each picture is drawn.                                                                                   |
| `viewchange`, `viewmodechange`, `stabilizationchange` | the view, mode or setting | Whatever changed it.                                                                                                 |
| `motionlookchange`                                    | the motion look state     | Turned on or off, or found available or not.                                                                         |
| `qualitychange`                                       | the quality               | Whatever changed it.                                                                                                 |
| `volumechange`                                        | `{ volume, isMuted }`     | Whatever changed it.                                                                                                 |
| `warning`                                             | `{ code, message }`       | Something the player worked around (below).                                                                          |
| `error`                                               | `GyroViewError`           | The load or playback failed: `code`, `category` and `message` (see "When a recording cannot play").                  |

A `warning`'s code says what the player worked around: `recording-degraded` for missing or
damaged data such as no gyro or an unverified IMU frame, `no-sound` for a silent clock,
`autoplay-blocked`, `playback-failed` for a refused start or a seek bar position it could not
show, `ignored-attribute` for a value it does not know, `refused-property` for a property set
before the element was defined, `motion-look-refused` when the viewer or an iframe's `allow`
refused the device's attitude (motion look is then unavailable), and `motion-look-needs-gesture`
when motion look was started outside a tap.

Controls: over the bottom of the picture, a seek bar above play, mute with a volume slider, the
time, the Stabilization and View buttons (each showing the icon of the choice in effect and
opening a menu of the choices, each with its icon and a line describing it), the motion look
toggle, Reset view and Fullscreen, a toggle pressed while the player fills the screen, drawn as
the way out. They fit the player's own width, not the page's: a narrower
player gives up the volume slider and shows its menus over the whole player, then gives up the
time and Reset view in turn, and, while the motion look toggle shows, the Stabilization menu
rather than the toggle. On touch every target is 44 pixels and the
volume is left to the device. Stabilization is offered only for a recording with a gyro, in the
two stitched view modes; the motion look toggle only in the normal view, on a device that reports
its attitude.

Motion look: on a phone or tablet the toggle lets the device turn the normal view, as a window
into the recording held up to look through: turning it turns the view, tilting it looks up and
down, and rolling it keeps the horizon level with the real one (the recording's own horizon is
level where stabilization levels it, in `lock` and `horizon`). While it is on, a sideways drag or
the Left and Right arrows turn the heading, the pitch stays the device's, a pinch zooms about the
centre, and Reset view looks ahead at the default zoom; a page's `lookAt` or `yaw` sets the
heading, its `pitch` is left to the device. iOS asks the viewer for access at the first press,
and only during a press: a page with its own button calls `startMotionLook()` from its click
handler. It needs a secure context, as the player does, and inside an iframe the `allow` below.
`viewchange` fires as the device turns, while the roll it gives the view stays inside the
player.

Keyboard: space or K play/pause, J and L seek, S stops, arrows look around (Shift + arrows
seek), plus and minus zoom, 0 resets the view, M mutes, F fills the screen, Escape closes an
open menu first and then leaves fullscreen (in the browser's own fullscreen, the browser takes
the first Escape itself); an Escape the player takes goes no further, to a dialog around it.
A focused slider keeps its arrows and a focused button
its Space. Mouse and touch: drag to look, wheel or pinch to zoom toward the pointer or the
fingers (the keys zoom about the centre), tap to play or pause (on touch, a tap on faded
controls only brings them back). The equirectangular panorama and the raw lenses zoom up to
eight times; a zoomed panorama moves up and down as well as turning,
zoomed raw lenses move in every direction, by drags and arrows alike, and Reset view returns the
current view to where it started. The cursor turns into a hand only where a drag moves the
picture.

Styling: the host element sizes the player (a block with a 16:9 aspect ratio by default).
Custom properties theme the controls: `--gyro-view-text` (`#fff`; secondary words, fills and
tracks are this colour at lower strengths), `--gyro-view-accent` (`#fff`: the filled seek and
volume, their handles, the checked choice and the focus ring), `--gyro-view-controls-background`
(`rgb(0 0 0 / 60%)`, the shade under the bar), `--gyro-view-menu-background`
(`rgb(24 24 23 / 92%)`, behind a blur), `--gyro-view-font` (the system stack) and
`--gyro-view-radius` (`8px`; menus take one and a half times it). `::part(stage)`,
`::part(canvas)`, `::part(poster)`, `::part(controls)`, `::part(big-play)`, `::part(loading)`,
`::part(error)`, `::part(error-message)` and `::part(error-code)` reach the parts. The element
writes its state on itself for a page's selectors, and a page never sets these: `data-status`
(the status, as in `gyro-view[data-status='error']`), `data-has-frame` once the recording loaded
now has drawn a picture (until then the canvas shows nothing, the previous recording's last
picture included), `data-idle` while the controls have faded, `data-fill` while it is pinned
over the page in place of fullscreen, with `popover="manual"` beside it where the browser has
popovers, unless the page made a popover of it itself. Under
`prefers-reduced-motion` the spinner turns slower and the controls do not fade; under
`prefers-reduced-transparency`, and where the browser has no backdrop blur, the menus are
opaque; forced colours keep the sliders and the menus' edges visible.

Words: every label, menu choice and failure message is in English until the page gives its own
through `messages`, table by table, and `null` brings the defaults back. The tables are
`labels`, `stabilizationModes` and `viewModes` (the choices' names, which also name the setting
buttons for assistive technology), `stabilizationModeDescriptions` and `viewModeDescriptions` (the
line under each choice in a menu), and `errors`:

```js
player.messages = {
  labels: { play: 'Lecture', pause: 'Pause', player: 'Lecteur vidéo 360°' },
  viewModes: { 'raw-lenses': 'Objectifs bruts' },
  errors: { cors: 'Cette vidéo ne peut pas être chargée ici.' },
};
```

A failure shows the visitor a plain sentence and its code, and hides the controls; the `error`
event carries the developer's account of it (which server answered what). The events do not
bubble, as a media element's do not; a page that hears every player in a container listens in
the capture phase: `container.addEventListener('error', listener, true)`.

### As an iframe

```html
<div id="player" style="aspect-ratio: 16 / 9"></div>
<script src="https://your-host/embed.js"></script>
<script>
  const { handle } = GyroView.embed(document.querySelector('#player'), {
    src: 'https://media.example/VID_20260814_132640_00_013.insv',
    stabilization: 'lock',
    muted: true,
  });
  handle.events.on('ready', (metadata) => console.log(metadata.model));
  handle.play();
</script>
```

`GyroView.embed` puts an `<iframe allow="fullscreen; autoplay; accelerometer; gyroscope; magnetometer">` pointing at `embed.html`
in the container and returns the same API as the element, as promises over `postMessage`
(`play`, `pause`, `stop`, `seek`, `scrub`, `lookAt`, `resetView`, `zoom`, `setViewMode`,
`setStabilization`, `setVolume`, `setMuted`, `setLoop`, `load`, `getState`), the player's events
but `frame` on `handle.events`, and a `state` mirror, `motionLook` included; motion
look starts only from the frame's own toggle, since a tap on the page does not reach the frame.
The frame talks only to the page that embedded it and
the page only to the frame. A frame that loads but never answers (a wrong `embedPageUrl`, a host
that refuses to be framed) fails the handle's promises with `embed-unreachable` ten seconds
later, and a command the frame does not know, from a snippet newer than the frame, with
`invalid-argument`. On an iPhone, which has no fullscreen for an element, the Fullscreen button
inside the iframe fills only the iframe for now; the element form fills the screen. Moving the
container reloads the iframe, as the browser does with any iframe: it starts again from the embed options, and commands it had not answered are asked again.
Without the snippet, an iframe of
`embed.html?src=...&stabilization=lock&muted=1` plays on its own; every attribute above is a
query parameter (`controls=0` hides the controls; the snippet's `viewMode` option is the
`view-mode` parameter).

### Inspecting a recording

`inspectRecording(fileOrUrl)`, from the npm package, reads what a recording holds without playing
it, as plain data: the boxes and trailer records, the info record (camera, firmware, frame rate,
capture mode), the lens calibration and summaries of the gyro and exposure records.

## Serving recordings

The player reads the multi-gigabyte file in byte ranges straight from the camera's layout, so
the server hosting the recordings must answer `Range` requests with `206` (a `HEAD` with
`Content-Length` saves a request, but is not required), and send CORS headers when the player
runs on another origin, which for the iframe form is the one serving `embed.html` (a refusal is
reported as `cors`). A recording kept behind the visitor's cookies on another origin needs
`crossorigin="use-credentials"`, and a host that names the page's origin (not `*`) with
`Access-Control-Allow-Credentials: true`. One that wants a token in a header, as a cloud drive's
download API does, takes the page's own function in the element's `fetch` property, which adds
it to every request. The player page itself must be served over HTTPS,
because WebCodecs exists only in secure contexts. [The deployment guide](docs/DEPLOYMENT.md) has
the exact headers, the hosting layout and the error codes.

## Browsers

Browsers decode HEVC only in hardware: 5.7K plays on recent laptops and phones, 8K needs a
Level 6 decoder (Apple Silicon, recent NVIDIA and Intel). On Linux, Chrome reaches the decoder
only through VA-API, so not with NVIDIA's own driver or in a virtual machine. A recording this
browser cannot decode is reported as `codec-unsupported`; the camera's low-resolution `LRV`
proxy is never played in its place. The oldest browser versions that work are in the
[npm package's requirements](apps/library/README.md#requirements).

## When a recording cannot play

Every failure is a `GyroViewError` with a stable `code`, its `category` and a `message` for the
developer. A failed load or playback arrives once: `status` turns `error`, `load()` rejects and
the `error` event carries the error (on `handle.events` for the iframe). The player never plays
anything in the recording's place; what the page does next is its own choice. The category says
whose side the failure is on:

- `browser`: this browser cannot decode or draw the recording. `codec-unsupported` (no decoder
  for the recording's video), `webcodecs-unavailable` (no WebCodecs: a page not served over
  HTTPS, or an old browser), `render-unavailable`, `decode`, `playback-blocked`.
- `recording`: the file is not one the player can play: not from an Insta360 camera, damaged,
  cut short, or without its calibration or its second file. `invalid-trailer`,
  `unsupported-container`, `unsupported-layout`, `missing-second-file`, `no-calibration`,
  `no-info-record`, `no-key-frame`, and the codes of the parsers beneath them:
  `binary-out-of-bounds`, `binary-unsafe-integer`, `invalid-byte-range`, `invalid-calibration`,
  `invalid-protobuf`, `unsupported-calibration`, `unsupported-gyro-record`,
  `unsupported-info-format`.
- `source`: the recording's bytes could not be read as the player reads them. `cors`,
  `range-unsupported`, `source-unreadable`, `source-changed`, `source-truncated`.
- `usage`: the page called the API with something it does not accept. `invalid-argument`,
  `embed-destroyed`, `embed-unreachable` (the iframe loaded but never answered), and as
  `play()`'s rejection, as a video's `play()` rejects: `no-source`
  (nothing to play) and `play-interrupted` (a newer `src` or the element's removal came first).
- `internal`: a failure the player did not expect, worth an issue. `invariant-violation`,
  `index-out-of-range`.

A page that falls back to the browser's own `<video>` gets the file's first video track as
recorded: one lens, or both packed into one picture, unstitched and unsteadied. That helps where
the browser still decodes the video: without WebGL 2 (`render-unavailable`), without WebCodecs
(`webcodecs-unavailable`), when the host lacks CORS or byte ranges (`cors`, `range-unsupported`:
a `<video>` without `crossorigin` needs neither), and for a file the player cannot read as a
camera recording. It does not help with `codec-unsupported`, since the `<video>` has the same
decoders, and it does not fail there either: it plays the sound under a black picture,
streaming the interleaved recording, video bytes and all, with `videoWidth` 0 from
`loadedmetadata` on. Nor does it help with `source-unreadable`, `source-changed` or
`source-truncated`, where it reads the same bytes.

## Documentation

| Document                              | What it answers                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| [Deployment](docs/DEPLOYMENT.md)      | Hosting the bundles and the recordings; every error code.                            |
| [Roadmap](docs/ROADMAP.md)            | What is verified, what waits on real files or devices, the known limits, next steps. |
| [npm package](apps/library/README.md) | Installing it, its requirements and browsers, the player without the element.        |
| [Contributing](CONTRIBUTING.md)       | Working on GyroView itself: setup, tests, the code's layout, the design documents.   |
| [Security](SECURITY.md)               | How to report a vulnerability.                                                       |

## License

MIT; see [LICENSE](LICENSE). The two trailer fixtures under `test/fixtures/thirdparty` keep their
own MIT license.
