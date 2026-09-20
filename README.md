# GyroView

Browser player for raw Insta360 `.insv` recordings (X3, X4, X5). Plays the camera's
dual-fisheye files directly as a 360 video, stitched and gyro-stabilized on the GPU,
and embeds on any website as a `<gyro-view>` web component or an iframe.

## Status

Phases 0 to 4 are complete: feasibility (`spike/README.md`), format parsing and the CLI
(`packages/core`, `tools/insv-inspect`), the media pipeline (HTTP ranges, demuxing, lockstep
WebCodecs decoding, the playback session, the audio clock over Media Source Extensions,
capability probing and companion-file discovery), GPU stitching with Three.js
(`packages/adapters/three`) and gyro stabilization (orientation integration, lock, horizon and
follow modes). Phase 5, the `<gyro-view>` player and the embed page, is next.

## Development

```sh
nvm use           # Node 24 LTS from .nvmrc
pnpm install
pnpm --filter @gyroview/adapter-webcodecs exec playwright install chromium webkit
pnpm verify       # typecheck, lint, format check, dependency rules, tests
pnpm test:watch
```

Browser adapters are tested in headless Chromium and WebKit through Playwright. The end-to-end
tests in `tools/integration/src/browser` play the local sample recordings; they skip when the
samples are absent (as in CI) and drive the installed Google Chrome when there is one, because
Playwright's own Chromium build has no HEVC decoder.

See `CONTRIBUTING.md` for the architecture rules and the definition of done.

## Local samples

Sample recordings are large and live outside the repository. `samples/` holds
symlinks to local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files.
Small byte slices cut from them live in `test/fixtures/` with a manifest of their origin.
