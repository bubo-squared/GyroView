# Contributing

Everything for working on GyroView itself. Using the player is in the [README](README.md).

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

## Builds and tools

```sh
pnpm --filter @gyroview/embed dev               # developer page at http://localhost:5180 with the local samples
pnpm --filter @gyroview/embed build             # static site, embed.js and gyro-view.js in apps/embed/dist
pnpm --filter @bubo-squared/gyroview build      # the npm package in apps/library/dist
pnpm inspect <file.insv>                        # what inspectRecording reads, for a file on disk
pnpm fixtures:build                             # regenerate the synthetic recordings in test/fixtures
pnpm measure                                    # renders of the local samples in .artifacts, IMU frame ranking
pnpm --filter @gyroview/core run test:mutation  # Stryker over the core
```

## Sample recordings

Sample recordings are large and live outside the repository. `samples/` holds symlinks to
local folders and is git-ignored, as are all `.insv`, `.insp` and `.lrv` files. Small byte
slices cut from them live in `test/fixtures/x5` with a manifest of their origin;
`test/fixtures/synthetic` holds tiny two-track recordings with a real X5 trailer for the
browser tests; `test/fixtures/thirdparty` holds two MIT-licensed trailer fixtures.

The end-to-end tests in `tools/integration/src/browser` play the local sample recordings; they
are not started without the samples (as in CI), and they drive the installed Google Chrome on
macOS when there is one, because Playwright's own Chromium build has no HEVC decoder.
`pnpm measure` runs them again writing their renders to `.artifacts/` for inspection, with the
measurements too slow for every run, such as the IMU frame ranking of ADR 0009. The player's
renders and `measure/readingRenders.test.ts`'s, every calibration reading of both X5 samples at
a fixed moment, draw the same pixels run after run: saved before a change to a lens model, the
stitch or the colour, and compared after it, they show what the change moved.

A recording someone shared privately stays local (ADR 0031). Describe it in
`samples/catalogue.json`, git-ignored with the samples: its folder and file, frame rate, the
moments the tests render and rank at, its Studio export's frames and the moment its seam
steadiness is measured from if there is one, and its
`privateTokens` (the file name, the serial). The tests pick it up from there, and
`pnpm privacy:check` (part of `pnpm verify`, and of the commit hooks) refuses any of those words
in tracked files, staged changes or a commit message. Its bytes and its numbers never enter the
repository: tests of its camera use synthetic fixtures, and ADRs report measurements on it as
aggregates.

## On a phone

The developer page (`pnpm --filter @gyroview/embed dev`) lists the recordings in `samples/` and
streams them over byte ranges, with the frame rate and the drawing buffer beside the player.
A phone reaches it over the local network only through HTTPS, since WebCodecs exists only in
secure contexts, with a certificate the phone trusts. With [mkcert](https://github.com/FiloSottile/mkcert):

```sh
mkcert -install                                   # a local certificate authority, once
mkcert -cert-file dev-cert.pem -key-file dev-key.pem "$(scutil --get LocalHostName).local" localhost
GYROVIEW_DEV_CERT=dev-cert.pem GYROVIEW_DEV_KEY=dev-key.pem pnpm --filter @gyroview/embed dev
```

Keep the two files outside the repository, and give the dev command their full paths. On an
iPhone, install the authority's `rootCA.pem` (in the folder `mkcert -CAROOT` prints, sent over
AirDrop) as a profile, then turn on full trust for it in Settings, General, About, Certificate
Trust Settings. On the same network, open `https://<LocalHostName>.local:5180/` in Safari (the
certificate names the host, not the address the server prints, which changes). Safari's Web
Inspector on the Mac (Develop, then the phone) shows the page's console.

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
and add the winner there with the measurement in the ADR. A recording that cannot be committed
goes in the local catalogue instead (ADR 0031). With its Studio export, the same run measures
its lens scale and pose against Insta360's stitch and at its own seam (ADR 0023, ADR 0025,
`measure/lensReadings.test.ts`); a calibration string of a new version is a row of its layout
family (`meiLayout`), and a new colour encoding a display conversion (ADR 0033).

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
- `apps/library`: the npm package `@bubo-squared/gyroview` (ADR 0020); its public API is
  `src/index.ts`.
- `tools/*`: developer CLIs (`insv-inspect`), the fixture builder (`fixtures`) and the
  end-to-end tests over the real recordings (`integration`).

## Documentation

| Document                                     | What it answers                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised; every package and key component.                   |
| [docs/FORMAT.md](docs/FORMAT.md)             | The `.insv` byte layout as the player reads it.                               |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)         | The vocabulary used in code and documents.                                    |
| [docs/FEASIBILITY.md](docs/FEASIBILITY.md)   | The measurements the design rests on.                                         |
| [docs/adr/](docs/adr/README.md)              | One record per non-obvious decision, listed in its index.                     |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | What is done and verified, what waits on real files or devices, what is next. |

## Releasing the npm package

`.github/workflows/release.yml` publishes `apps/library` to npm as `@bubo-squared/gyroview` when
a version tag is pushed:

1. Set the new version in `apps/library/package.json` (semantic versioning, 0.x while the API
   settles) and commit it.
2. Tag that commit `v<version>` and push the tag (`git push origin v<version>`). The workflow
   checks that the tag names the version, runs `pnpm verify` and publishes with provenance.

Once, for the first version: npm trusts a workflow only for a package that already exists.

1. Publish the first version by hand, in a terminal, from an npm account that may publish
   under the `@bubo-squared` scope: `npm login`, `pnpm --filter @bubo-squared/gyroview build`,
   then in `apps/library` `pnpm pack` and
   `npm publish bubo-squared-gyroview-<version>.tgz --@bubo-squared:registry=https://registry.npmjs.org`.
   The scope's registry is named on the command line because a `~/.npmrc` that sends the scope
   to GitHub Packages wins over the manifest's `publishConfig` and over `--registry` (seen with
   npm 11 when 0.1.0 was published). npm asks for the second factor through a link it shows
   only in an interactive terminal.
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
5. A non-obvious decision has an ADR in `docs/adr/` listing the alternatives considered, and a
   line in its index, `docs/adr/README.md`.
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
