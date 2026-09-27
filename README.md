# GyroView

Browser player for raw Insta360 `.insv` recordings (X3, X4, X5). It plays the camera's
dual-fisheye files directly as a 360 video, stitched and gyro-stabilized on the GPU, and embeds
on any website as a `<gyro-view>` web component or an iframe. No Insta360 Studio export step.

## Features

- Plays the raw file at full resolution over HTTP byte ranges or from a local file; the second
  lens file of a split-file recording is found beside it when it exists.
- Decodes both lens tracks in hardware with WebCodecs, in lockstep, with the recording's own
  audio as the clock; sound waits for the picture rather than running ahead.
- Stitches through the factory calibration in one GPU pass, with a feathered seam and
  exposure matching between the lenses; a normal view to look around in, the whole sphere as
  an equirectangular panorama, or the two lens images raw, side by side or stacked.
- Stabilizes from the gyro: lock, horizon or follow, sampled at each frame's mid-exposure.
- Ships as the npm package `gyroview`, as an element (`gyro-view.js`) and as an iframe (`embed.html` plus `embed.js`) with
  the same API and events, plus a developer page for trying recordings.

Verified on Insta360 X5 recordings; other cameras' format variants are implemented from
documentation and covered by synthetic fixtures. `docs/ROADMAP.md` says exactly what is
verified, what is waiting on real files or devices, and what could come next.

## Using the player

Both ways play a recording from a URL whose server answers byte ranges (see "Serving
recordings").

### As an element

In a project with a bundler, install the npm package (`apps/library/README.md`):

```sh
npm install gyroview
```

```ts
import 'gyroview/define'; // registers <gyro-view>
```

Without a bundler, load the package's standalone file (Three.js and the demuxer inside) from
a CDN or your own host; the site build's `gyro-view.js` registers the element the same way:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/gyroview@0.1/dist/standalone.js"></script>

<gyro-view
  src="https://media.example/VID_20260814_132640_00_013.insv"
  stabilization="lock"
  controls
  muted
></gyro-view>
```

Attributes:

| Attribute                   | Values                                    | What it does                                                                                                        |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src`                       | URL                                       | The recording; a relative URL resolves against the page.                                                            |
| `src2`                      | URL                                       | The other lens's file of a split-file recording; found by itself when it sits beside `src` under the camera's name. |
| `autoplay`                  | boolean                                   | Starts once ready; a refusal is an `autoplay-blocked` warning.                                                      |
| `muted`, `loop`, `controls` | boolean                                   | As on a video element; `controls` shows the bar.                                                                    |
| `poster`                    | URL                                       | Shown until the first picture.                                                                                      |
| `preload`                   | `auto`, `none`                            | `none` keeps the decoders idle until play; otherwise the first frame shows at once.                                 |
| `gain-match`                | `on`, `off`                               | `off` leaves the lenses' exposure as recorded.                                                                      |
| `stabilization`             | `off`, `lock`, `horizon`, `follow`        | How the gyro steadies the picture.                                                                                  |
| `view-mode`                 | `normal`, `equirectangular`, `raw-lenses` | What the picture shows (below).                                                                                     |
| `fov`                       | 30 to 120                                 | The normal view's horizontal field of view, in degrees.                                                             |
| `yaw`, `pitch`              | degrees                                   | Where the normal view looks: yaw positive to the right, pitch positive up.                                          |

`equirectangular` shows the whole sphere as a level 2:1 panorama. `raw-lenses` shows the
decoded lens images side by side or stacked, whichever shows them larger, unstitched and as
recorded; the camera records a square a little smaller than each lens's image circle, so the
circles show cut at the frame's edges, where the two tiles meet as well.

The settings (`stabilization`, `view-mode`, `fov`, `yaw`, `pitch`, `muted`, `loop`) are
applied when their attribute changes, and their properties (`viewMode` for `view-mode`, plus
`volume`) report and change the setting in effect, as a video's `muted` property does, however
it was last changed. The other attributes are mirrored by properties (`gainMatch` for
`gain-match`); `preload` and `gainMatch` read the keyword in effect.

Methods and properties:

| Member                                        | What it does                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `load()`                                      | Resolves once the recording is ready; an element out of the page loads once connected.          |
| `loadFiles({ main, second })`                 | Plays local files in place of `src`, until `src` or `src2` change.                              |
| `play()`, `pause()`, `stop()`                 | As a video's; `play()` waits for a load in progress.                                            |
| `seek(seconds)`, `currentTime`                | Seeks exactly.                                                                                  |
| `scrub(seconds)`                              | Seeks to the key frame at or before the time: quick to show while a seek bar is dragged.        |
| `duration`, `paused`, `status`, `metadata`    | What is loaded and where playback is.                                                           |
| `view`, `lookAt(yaw, pitch)`, `resetView()`   | Where the normal view looks.                                                                    |
| `zoom(steps, focus?)`                         | Zooms toward a point of the picture given as fractions of its size, or about the centre.        |
| `setViewMode(mode)`, `setStabilization(mode)` | As the attributes; an unknown mode is refused.                                                  |
| `volume`                                      | 0 to 1, where the platform lets a page set it.                                                  |
| `messages`                                    | Every word the element shows (below).                                                           |
| `toggleFullscreen()`                          | Fills the screen through the Fullscreen API, or pins the element over the page where it cannot. |

Events, each a `CustomEvent` with its payload in `detail`, typed in `GyroViewElementEventMap`:

| Event                                                 | `detail`                  | When                                                                                                                 |
| ----------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ready`                                               | metadata                  | The recording is ready: camera, layout, calibration version, frame time source, gyro and IMU frame, audio, duration. |
| `statuschange`                                        | status                    | `idle`, `loading`, `ready`, `playing`, `buffering`, `paused`, `seeking`, `ended` or `error`.                         |
| `play`, `playing`, `waiting`, `pause`, `ended`        | none                      | As a video's.                                                                                                        |
| `timeupdate`                                          | seconds                   | Every quarter second of playback, and on a pause, a seek or the end.                                                 |
| `seeking`, `seeked`                                   | seconds                   | Around a seek.                                                                                                       |
| `frame`                                               | seconds                   | Right after each picture is drawn.                                                                                   |
| `viewchange`, `viewmodechange`, `stabilizationchange` | the view, mode or setting | Whatever changed it.                                                                                                 |
| `volumechange`                                        | `{ volume, isMuted }`     | Whatever changed it.                                                                                                 |
| `warning`                                             | `{ code, message }`       | Something the player worked around (below).                                                                          |
| `error`                                               | `GyroViewError`           | The load or playback failed: `code` and `message`; `docs/DEPLOYMENT.md` lists the codes.                             |

A `warning`'s code says what the player worked around: `recording-degraded` for missing or
damaged data such as no gyro or an unverified IMU frame, `no-sound` for a silent clock,
`autoplay-blocked`, `playback-failed` for a refused start, a seek bar position it could not
show or a loop that could not restart, `ignored-attribute` for a value it does not know, and
`refused-property` for a property set before the element was defined.

Keyboard: space or K play/pause, J and L seek, S stops, arrows look around (Shift + arrows
seek), plus and minus zoom, 0 resets the view, M mutes, F fills the screen, Escape closes an
open menu first and then leaves fullscreen (in the browser's own fullscreen, the browser takes
the first Escape itself). A focused slider keeps its arrows and a focused button
its Space. Mouse and touch: drag to look, wheel or pinch to zoom toward the pointer or the
fingers (the keys zoom about the centre), tap to play or pause (on touch, a tap on faded
controls only brings them back). The equirectangular panorama and the raw lenses zoom up to
four times; a zoomed panorama moves up and down as well as turning,
zoomed raw lenses move in every direction, by drags and arrows alike, and Reset view returns the
current view to where it started. The cursor turns into a hand only where a drag moves the
picture.

Styling: the host element sizes the player (a block with a 16:9 aspect ratio by default);
`--gyro-view-accent`, `--gyro-view-controls-background`, `--gyro-view-text`,
`--gyro-view-font` and `--gyro-view-radius` theme the controls; `::part(stage)`,
`::part(canvas)`, `::part(poster)`, `::part(controls)`, `::part(big-play)`, `::part(loading)`,
`::part(error)`, `::part(error-message)` and `::part(error-code)` reach the parts. The element
writes its state on itself for a page's selectors, and a page never sets these: `data-status`
(the status, as in `gyro-view[data-status='error']`), `data-has-frame` once a picture is drawn,
`data-idle` while the controls have faded, `data-fill` while it is pinned over the page in
place of fullscreen. Under `prefers-reduced-motion` the spinner turns slower and the controls
do not fade.

Words: every label, menu choice and failure message is in English until the page gives its own
through `messages`, table by table, and `null` brings the defaults back:

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

`GyroView.embed` puts an `<iframe allow="fullscreen; autoplay">` pointing at `embed.html`
in the container and returns the same API as the element, as promises over `postMessage`
(`play`, `pause`, `stop`, `seek`, `scrub`, `lookAt`, `resetView`, `zoom`, `setViewMode`,
`setStabilization`, `setVolume`, `setMuted`, `setLoop`, `load`, `getState`), the player's events
but `frame` on `handle.events`, and a `state` mirror. The frame talks only to the page that embedded it and
the page only to the frame. Moving the container reloads the iframe, as the browser does with any
iframe: it starts again from the embed options, and commands it had not answered are asked again.
Without the snippet, an iframe of
`embed.html?src=...&stabilization=lock&muted=1` plays on its own; every attribute above is a
query parameter (`controls=0` hides the controls; the snippet's `viewMode` option is the
`view-mode` parameter).

### Inspecting a recording

`inspectRecording(fileOrUrl)`, from the npm package, reads what a recording holds without playing
it, as plain data: the boxes and trailer records, the info record (camera, firmware, frame rate,
capture mode), the lens calibration and summaries of the gyro and exposure records; `pnpm inspect`
prints the same for a file on disk.

## Serving recordings

The player reads the multi-gigabyte file in byte ranges straight from the camera's layout, so
the server hosting the recordings must answer `Range` requests with `206` (a `HEAD` with
`Content-Length` saves a request, but is not required), and send CORS headers when the player
runs on another origin, which for the iframe form is the one serving `embed.html` (a refusal is
reported as `cors`). The player page itself must be served over HTTPS, because WebCodecs
exists only in secure contexts. `docs/DEPLOYMENT.md` has the exact headers, the hosting layout
and the error codes.

Browsers decode HEVC only in hardware: 5.7K plays on recent laptops and phones, 8K needs a
Level 6 decoder (Apple Silicon, recent NVIDIA and Intel). A recording this browser cannot decode
is reported as `codec-unsupported`; the camera's low-resolution `LRV` proxy is never played in
its place (ADR 0017).

## Development

```sh
nvm use           # Node 24 LTS from .nvmrc
pnpm install
pnpm --filter @gyroview/adapter-webcodecs exec playwright install chromium webkit
pnpm verify       # typecheck, lint, format check, dependency rules, tests, build
pnpm test:core    # the domain alone, in 1.5 s; pnpm test --project <name> for one project
pnpm test:watch
pnpm test:coverage
pnpm --filter @gyroview/embed dev     # developer page at http://localhost:5180 with the local samples
pnpm --filter @gyroview/embed build   # static site, embed.js and gyro-view.js in apps/embed/dist
pnpm --filter gyroview build          # the npm package in apps/library/dist
pnpm inspect <file.insv>              # print what the core understands about a recording
pnpm fixtures:build                   # regenerate the synthetic recordings in test/fixtures
pnpm measure                          # renders of the local samples in .artifacts, IMU frame ranking
pnpm --filter @gyroview/core run test:mutation   # Stryker over the core
```

Browser adapters, the player and the embed site are tested in headless Chromium and WebKit
through Playwright. The end-to-end tests in `tools/integration/src/browser` play the local
sample recordings; they are not started without the samples (as in CI), and they drive the
installed Google Chrome on macOS when there is one, because Playwright's own Chromium build has
no HEVC decoder.
`pnpm measure` runs them again writing their renders to `.artifacts/` for inspection, with the
measurements too slow for every run, such as the IMU frame ranking of ADR 0009.

### Local samples

Sample recordings are large and live outside the repository. `samples/` holds symlinks to
local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files. Small byte
slices cut from them live in `test/fixtures/x5` with a manifest of their origin;
`test/fixtures/synthetic` holds tiny two-track recordings with a real X5 trailer for the
browser tests; `test/fixtures/thirdparty` holds two MIT-licensed trailer fixtures.

## Documentation

| Document               | What it answers                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md` | How the code is organised; every package and key component.                      |
| `docs/ROADMAP.md`      | What is done and verified, what waits on real files or devices, what is next.    |
| `docs/DEPLOYMENT.md`   | Hosting the bundles and the recordings; every error code.                        |
| `docs/FORMAT.md`       | The `.insv` byte layout as the player reads it.                                  |
| `docs/GLOSSARY.md`     | The vocabulary used in code and documents.                                       |
| `docs/FEASIBILITY.md`  | The measurements the design rests on.                                            |
| `docs/adr/`            | One record per non-obvious decision, with the alternatives considered.           |
| `CONTRIBUTING.md`      | Fast feedback, proposing a change, recipes, the dependency rule, the checklists. |

Architecture decision records: 0001 hexagonal architecture, 0002 WebCodecs over video
elements, 0003 mediabunny as the demuxer, 0004 format variants selected from the file, 0005
calibration string interpretation, 0006 Node 24 toolchain, 0007 the audio element as the
clock, 0008 stitching frames and poses, 0009 IMU frame and stabilization, 0010 player
composition and embedding, 0011 sound follows the picture, 0012 gain matching along the seam,
0013 byte-range reads bypass the browser cache, 0014 the frame shows the whole calibration
square, 0015 view modes replace projections, 0016 the player owns its settings, 0017 the
recording itself or an error, 0018 every view mode zooms toward the pointer, 0019 a range that
fails on the way is asked for again, 0020 one npm package bundles the core and the adapters.

## License

MIT; see `LICENSE`. The two trailer fixtures under `test/fixtures/thirdparty` keep their own MIT
license.
