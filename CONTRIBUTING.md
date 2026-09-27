# Contributing

## Toolchain

- Node 24 LTS (`.nvmrc`; run `nvm use`). dependency-cruiser refuses odd-numbered Node releases.
- pnpm 11 (`packageManager` in `package.json`).
- `pnpm install`, then `pnpm verify` runs everything CI runs: typecheck, lint, format check,
  dependency rules, tests, and the builds of the embed site, its scripts and the npm package.

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
