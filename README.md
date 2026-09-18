# GyroView

Browser player for raw Insta360 `.insv` recordings (X3, X4, X5). Plays the camera's
dual-fisheye files directly as a 360 video, stitched and gyro-stabilized on the GPU,
and embeds on any website as a `<gyro-view>` web component or an iframe.

## Status

Phase 0 (feasibility) is complete: see `spike/README.md` for measured decode and upload
performance in Chrome and WebKit. Phase 1 (format parsing in `packages/core`) is in progress.

## Development

```sh
nvm use           # Node 24 LTS from .nvmrc
pnpm install
pnpm verify       # typecheck, lint, format check, dependency rules, tests
pnpm test:watch
```

See `CONTRIBUTING.md` for the architecture rules and the definition of done.

## Local samples

Sample recordings are large and live outside the repository. `samples/` holds
symlinks to local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files.
Small byte slices cut from them live in `test/fixtures/` with a manifest of their origin.
