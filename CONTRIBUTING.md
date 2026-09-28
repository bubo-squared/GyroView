# Contributing

## Toolchain

- Node 24 LTS (`.nvmrc`; run `nvm use`). dependency-cruiser refuses odd-numbered Node releases.
- pnpm 11 (`packageManager` in `package.json`).
- `pnpm install`, then `pnpm verify` runs everything CI runs: typecheck, lint, format check,
  dependency rules, tests, and the builds of the embed site, its scripts and the npm package.

## Fast feedback

`pnpm verify` takes about a minute; most changes need a fraction of it while they are made:

```sh
pnpm test:core                  # the domain and use cases, in Node: about 1.5 s
pnpm test --project player      # one project; the names are in each vitest.config.ts
pnpm test:watch --project core  # rerun on save
pnpm test:coverage              # every project with coverage, in Node, Chromium and WebKit
```

The browser projects (the player, the WebCodecs, Three.js and MSE adapters, the embed site)
run in headless Chromium and WebKit through Playwright; `pnpm --filter
@gyroview/adapter-webcodecs exec playwright install chromium webkit` installs them once.

## Proposing a change

1. Open an issue first for anything larger than a fix, so the approach can be agreed before
   the work: the issue templates ask for what a reviewer needs.
2. Work on a branch of your fork, one concern per pull request. Commits follow the
   conventional-commit style (`fix(core): ...`), each small and single-purpose; the pre-commit
   hook lints and formats what is staged.
3. `pnpm verify` is green before you push; CI runs the same on the pull request.
4. The pull request template's checklist is the definition of done below. A reviewer reads
   against the review checklist at the end of this file.

## Recipes

**A camera model.** Everything the player reads from a recording (trailer wrapper, record
locator, gyro layout, calibration version, lens layout, frame times) is detected from the file
itself (ADR 0004), so a new camera usually plays as it is. The one thing a model decides is the
IMU's orientation in the body: `IMU_FRAMES_BY_MODEL` in
`packages/core/src/domain/motion/imu/ImuFrame.ts`. Measure it on a real recording with
`pnpm measure`, which ranks the 24 candidate frames by how still the world stays (ADR 0009),
and add the winner there with the measurement in the ADR.

**A stabilization mode.** Add it to `StabilizationMode` and `STABILIZATION_MODES`
(`domain/motion/stabilization/Stabilizer.ts`), give it a strategy in `STABILIZERS`
(`stabilizers.ts`) and a menu label in `DEFAULT_MESSAGES`
(`packages/player/src/controls/messages.ts`). The records keyed by the mode refuse to compile
until each has its entry; the element, the menus and the embed protocol take the mode from the
same list.

**A view mode.** Add it to `ViewMode` and `VIEW_MODES` (`domain/view/ViewMode.ts`), write its
`ViewModeRules` in a module of its own beside `normalView.ts`, register it in `viewModes.ts`
and label it in `DEFAULT_MESSAGES`. A mode that draws a new kind of picture adds it to
`Picture.ts`, and the Three.js adapter a shader program for it (`shaderPrograms.ts`,
`pictureMaterials.ts`, `rendererUniforms.ts`); ADRs 0015 and 0018 explain the split between
what the core frames and what the renderer draws.

## Layout and dependency rule

Hexagonal architecture, enforced by `.dependency-cruiser.cjs`; `docs/ARCHITECTURE.md`
describes the components layer by layer:

- `packages/core`: domain and application code. Pure TypeScript, no runtime dependencies, no DOM
  or Node types in `src` (tests may use Node).
- `packages/adapters/*`: one external technology per package, implementing `core` ports. All but
  the node adapter run in a browser: no Node built-ins or Node types outside tests.
- `packages/player`: the composition root (`openRecording`, `buildPipeline`), the headless
  `Player` and the `<gyro-view>` element with its controls and gestures.
- `apps/embed`: the static site: embed page, `embed.js` snippet with the postMessage bridge,
  `gyro-view.js` bundle, developer page. Apps import the player, never the adapters.
- `apps/library`: the npm package `gyroview` (ADR 0020); its public API is `src/index.ts`.
- `tools/*`: developer CLIs (`insv-inspect`), the fixture builder (`fixtures`) and the
  end-to-end tests over the real recordings (`integration`).

## Releasing the npm package

`.github/workflows/release.yml` publishes `apps/library` to npm as `gyroview` when a version tag
is pushed:

1. Set the new version in `apps/library/package.json` (semantic versioning, 0.x while the API
   settles) and commit it.
2. Tag that commit `v<version>` and push the tag (`git push origin v<version>`). The workflow
   checks that the tag names the version, runs `pnpm verify` and publishes with provenance.

Once, for the first version: npm trusts a workflow only for a package that already exists.

1. Publish the first version by hand: `npm login`, `pnpm --filter gyroview build`, then in
   `apps/library` `pnpm pack` and `npm publish gyroview-<version>.tgz --access public`.
2. On npmjs.com, in the package's settings, add a trusted publisher: GitHub Actions, owner
   `bubo-squared`, repository `GyroView`, workflow `release.yml`, environment `npm`.
3. On GitHub, in the repository's settings, give the `npm` environment (created by the first
   run of the workflow, or by hand) required reviewers and limit it to `v*` tags, so a pushed
   tag publishes only once someone approves it.

Releases after it go through the workflow; the tag of the version published by hand needs no
push.

## Definition of done for a change

1. Tests came first for parsers, models and use cases; every behaviour has a test named as a sentence.
2. `pnpm verify` is green. No lint rule is disabled inline without a comment explaining why.
3. Every byte offset, record id, size and tuning constant is a named constant with its source cited.
4. New concepts use the vocabulary in `docs/GLOSSARY.md`; new terms are added there.
5. A non-obvious decision has an ADR in `docs/adr/` listing the alternatives considered.
6. Public API of a package has TSDoc; comments elsewhere explain why, not what.
7. Commits are small and single-purpose, in conventional-commit style.

## Review checklist

- Does each class or module have one reason to change?
- Are variants (lens layout, calibration version, gyro format) selected from data in the file
  rather than from the camera model string?
- Are units carried in branded types where microseconds, milliseconds, degrees and radians meet?
- Are errors typed `GyroViewError`s with a stable code, and is optional data modelled as absence
  rather than as an exception?
- Are test doubles used only at ports, with the contract test run against the real adapter too?
- Would the change survive a file from a camera we have never seen?
