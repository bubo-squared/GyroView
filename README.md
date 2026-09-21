# GyroView

Browser player for raw Insta360 `.insv` recordings (X3, X4, X5). It plays the camera's
dual-fisheye files directly as a 360 video, stitched and gyro-stabilized on the GPU, and embeds
on any website as a `<gyro-view>` web component or an iframe. No Insta360 Studio export step.

## Features

- Plays the raw file over HTTP byte ranges or from a local file; the camera's proxy and the
  second lens file are found beside it when they exist.
- Decodes both lens tracks in hardware with WebCodecs, in lockstep, with the recording's own
  audio as the clock; sound waits for the picture rather than running ahead.
- Stitches through the factory calibration in one GPU pass, with a feathered seam and
  exposure matching between the lenses; three projections and full look-around.
- Stabilizes from the gyro: lock, horizon or follow, sampled at each frame's mid-exposure.
- Ships as an element (`gyro-view.js`) and as an iframe (`embed.html` plus `embed.js`) with
  the same API and events, plus a developer page for trying recordings.

Verified on Insta360 X5 recordings; other cameras' format variants are implemented from
documentation and covered by synthetic fixtures. `docs/ROADMAP.md` says exactly what is
verified, what is waiting on real files or devices, and what could come next.

## Using the player

Both ways play a recording from a URL whose server answers byte ranges (see "Serving
recordings").

### As an element

```html
<script type="module" src="https://your-host/gyro-view.js"></script>

<gyro-view
  src="https://media.example/VID_20260814_132640_00_013.insv"
  stabilization="lock"
  controls
  muted
></gyro-view>
```

Attributes: `src` (the recording), `src2` (the other lens's file of a split-file recording,
found by itself when it sits beside `src` under the camera's name), `proxy` (`auto`, `none` or
the URL of the camera's low-resolution `LRV` file), `quality` (`auto`, `full`, `proxy`),
`autoplay`, `muted`, `loop`, `controls`, `poster`, `preload` (`none` keeps the decoders idle
until play; otherwise the first frame shows at once), `gain-match` (`off` leaves the lenses'
exposure as recorded), `fov`, `yaw`, `pitch`, `projection` (`rectilinear`, `stereographic`,
`equirectangular`) and `stabilization` (`off`, `lock`, `horizon`, `follow`). Every attribute
is also a property (`gainMatch` for `gain-match`).

API: `play()`, `pause()`, `stop()`, `seek(seconds)`, `scrub(seconds)` (to the key frame at or
before the time, for a dragged seek bar), `currentTime`, `duration`, `paused`, `status`,
`metadata`, `view`, `lookAt(yaw, pitch)`, `resetView()`, `zoom(steps)`, `setStabilization(mode)`,
`volume`, `toggleFullscreen()`, `loadFiles({ main, second, proxy })`.

Events (`CustomEvent`s, payload in `detail`): `ready` (metadata: camera, layout, calibration
version, frame time source, gyro and IMU frame, audio, proxy), `statuschange` (`idle`,
`loading`, `ready`, `playing`, `buffering`, `paused`, `seeking`, `ended`, `error`), `play`,
`waiting`, `playing`, `pause`, `ended`, `timeupdate`, `seeking`, `seeked`, `frame`,
`viewchange`, `stabilizationchange`, `warning` (a feature degraded: no gyro, unverified IMU
frame, silent clock, proxy in use) and `error` (`code` and `message`; the codes are listed in
`docs/DEPLOYMENT.md`).

Keyboard: space or K play/pause, J and L seek, arrows look around (Shift + arrows seek), plus
and minus zoom, 0 resets the view, M mutes, F fills the screen. Mouse and touch: drag to look,
wheel or pinch to zoom, tap to play or pause.

Styling: the host element sizes the player (a block with a 16:9 aspect ratio by default);
`--gyro-view-accent`, `--gyro-view-controls-background`, `--gyro-view-text`,
`--gyro-view-font` and `--gyro-view-radius` theme the controls; `::part(canvas)`,
`::part(controls)`, `::part(poster)` and `::part(stage)` reach the parts.

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
(`play`, `pause`, `stop`, `seek`, `scrub`, `lookAt`, `resetView`, `zoom`, `setStabilization`,
`setVolume`, `setMuted`, `setLoop`, `load`, `getState`), the player's events on
`handle.events`, and a `state` mirror. The frame talks only to the page that embedded it and
the page only to the frame. Without the snippet, an iframe of
`embed.html?src=...&stabilization=lock&muted=1` plays on its own; every attribute above is a
query parameter (`controls=0` hides the controls).

## Serving recordings

The player reads the multi-gigabyte file in byte ranges straight from the camera's layout, so
the server hosting the recordings must answer `Range` requests with `206`, answer `HEAD` with
`Content-Length`, and send CORS headers when the page is on another origin (a refusal is
reported as `cors`). The player page itself must be served over HTTPS, because WebCodecs
exists only in secure contexts. `docs/DEPLOYMENT.md` has the exact headers, the hosting layout
and the error codes.

Browsers decode HEVC only in hardware: 5.7K plays on recent laptops and phones, 8K needs a
Level 6 decoder (Apple Silicon, recent NVIDIA and Intel). When the recording cannot be decoded
and a proxy exists, the proxy plays instead (`quality="auto"`).

## Development

```sh
nvm use           # Node 24 LTS from .nvmrc
pnpm install
pnpm --filter @gyroview/adapter-webcodecs exec playwright install chromium webkit
pnpm verify       # typecheck, lint, format check, dependency rules, tests
pnpm test:watch
pnpm --filter @gyroview/embed dev     # developer page at http://localhost:5180 with the local samples
pnpm --filter @gyroview/embed build   # static site, embed.js and gyro-view.js in apps/embed/dist
pnpm inspect <file.insv>              # print what the core understands about a recording
pnpm fixtures:build                   # regenerate the synthetic recordings in test/fixtures
pnpm --filter @gyroview/core run test:mutation   # Stryker over the core
```

Browser adapters, the player and the embed site are tested in headless Chromium and WebKit
through Playwright. The end-to-end tests in `tools/integration/src/browser` play the local
sample recordings; they skip when the samples are absent (as in CI) and drive the installed
Google Chrome when there is one, because Playwright's own Chromium build has no HEVC decoder.

### Local samples

Sample recordings are large and live outside the repository. `samples/` holds symlinks to
local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files. Small byte
slices cut from them live in `test/fixtures/x5` with a manifest of their origin;
`test/fixtures/synthetic` holds tiny two-track recordings with a real X5 trailer for the
browser tests; `test/fixtures/thirdparty` holds two MIT-licensed trailer fixtures.

## Documentation

| Document               | What it answers                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md` | How the code is organised; every package and key component.                   |
| `docs/ROADMAP.md`      | What is done and verified, what waits on real files or devices, what is next. |
| `docs/DEPLOYMENT.md`   | Hosting the bundles and the recordings; every error code.                     |
| `docs/FORMAT.md`       | The `.insv` byte layout as the player reads it.                               |
| `docs/GLOSSARY.md`     | The vocabulary used in code and documents.                                    |
| `docs/FEASIBILITY.md`  | The measurements the design rests on.                                         |
| `docs/adr/`            | One record per non-obvious decision, with the alternatives considered.        |
| `CONTRIBUTING.md`      | The dependency rule, the definition of done, the review checklist.            |

Architecture decision records: 0001 hexagonal architecture, 0002 WebCodecs over video
elements, 0003 mediabunny as the demuxer, 0004 format variants selected from the file, 0005
calibration string interpretation, 0006 Node 24 toolchain, 0007 the audio element as the
clock, 0008 stitching frames and poses, 0009 IMU frame and stabilization, 0010 player
composition and embedding, 0011 sound follows the picture, 0012 gain matching along the seam,
0013 byte-range reads bypass the browser cache.
