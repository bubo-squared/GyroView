# GyroView

Browser player for raw Insta360 `.insv` recordings (X3, X4, X5). Plays the camera's
dual-fisheye files directly as a 360 video, stitched and gyro-stabilized on the GPU,
and embeds on any website as a `<gyro-view>` web component or an iframe.

## Status

Phases 0 to 5 are complete: feasibility (`spike/README.md`), format parsing and the CLI
(`packages/core`, `tools/insv-inspect`), the media pipeline (HTTP ranges, demuxing, lockstep
WebCodecs decoding, the playback session, the audio clock over Media Source Extensions,
capability probing and companion-file discovery), GPU stitching with Three.js
(`packages/adapters/three`), gyro stabilization (orientation integration, lock, horizon and
follow modes), the `<gyro-view>` player (`packages/player`) and the embed site (`apps/embed`).
Phase 6, hardening (buffering state, gain matching, Safari specifics, long clips, deployment
notes), is next.

## Using the player

Two ways in; both play the recording from a URL that serves byte ranges (see below).

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
`autoplay`, `muted`, `loop`, `controls`, `poster`, `fov`, `yaw`, `pitch`, `projection`
(`rectilinear`, `stereographic`, `equirectangular`) and `stabilization` (`off`, `lock`,
`horizon`, `follow`). Every attribute is also a property.

API: `play()`, `pause()`, `stop()`, `seek(seconds)`, `currentTime`, `duration`, `paused`,
`status`, `metadata`, `view`, `lookAt(yaw, pitch)`, `resetView()`, `zoom(steps)`,
`setStabilization(mode)`, `volume`, `toggleFullscreen()`, `loadFiles({ main, second, proxy })`.

Events (`CustomEvent`s, payload in `detail`): `ready` (metadata: camera, layout, calibration
version, frame time source, gyro and IMU frame, audio, proxy), `statuschange`, `play`, `pause`,
`ended`, `timeupdate`, `seeking`, `seeked`, `frame`, `viewchange`, `stabilizationchange`,
`warning` (a feature degraded: no gyro, unverified IMU frame, silent clock, proxy in use) and
`error` (`code` and `message`; codes are stable, see `GyroViewErrorCode` in the core).

Keyboard: space or K play/pause, J and L seek, arrows look around (Shift + arrows seek), plus
and minus zoom, 0 resets the view, M mutes, F fills the screen. Mouse and touch: drag to look,
wheel or pinch to zoom, tap to play or pause.

Styling: the host element sizes the player (it is a block with a 16:9 aspect ratio by default);
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
(`play`, `pause`, `stop`, `seek`, `lookAt`, `resetView`, `zoom`, `setStabilization`,
`setVolume`, `setMuted`, `setLoop`, `load`, `getState`), the player's events on
`handle.events`, and a `state` mirror. The frame talks only to the page that embedded it and
the page only to the frame. Without the snippet, an iframe of
`embed.html?src=...&stabilization=lock&muted=1` plays on its own; every attribute above is a
query parameter (`controls=0` hides the controls).

## Serving recordings

The player reads the multi-gigabyte file in byte ranges straight from the camera's layout, so
the server hosting the recordings must:

- answer `Range` requests with `206 Partial Content` and `Accept-Ranges: bytes` (every static
  file server and object store does; a server that answers `200` with the whole file is
  reported as `range-unsupported`);
- answer `HEAD` with `Content-Length` (or `405`, in which case a one-byte range is used);
- when the page is on another origin, send CORS headers:
  `Access-Control-Allow-Origin: <page origin>` (or `*`), `Access-Control-Allow-Methods: GET,
HEAD`, `Access-Control-Allow-Headers: Range` and `Access-Control-Expose-Headers:
Content-Range, Content-Length, Accept-Ranges`. A missing header shows as
  `source-unreadable` with a hint to check CORS.

The camera's proxy (`LRV_..._01_...lrv`) and the second lens file (`..._10_...insv`) are
looked for beside the recording under their camera names; both are optional.

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
pnpm fixtures:build                   # regenerate the synthetic recordings in test/fixtures
```

Browser adapters, the player and the embed site are tested in headless Chromium and WebKit
through Playwright. The end-to-end tests in `tools/integration/src/browser` play the local
sample recordings; they skip when the samples are absent (as in CI) and drive the installed
Google Chrome when there is one, because Playwright's own Chromium build has no HEVC decoder.

See `CONTRIBUTING.md` for the architecture rules and the definition of done.

## Local samples

Sample recordings are large and live outside the repository. `samples/` holds
symlinks to local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files.
Small byte slices cut from them live in `test/fixtures/` with a manifest of their origin, and
`test/fixtures/synthetic` holds tiny two-track recordings with a real X5 trailer for the
player's tests.
