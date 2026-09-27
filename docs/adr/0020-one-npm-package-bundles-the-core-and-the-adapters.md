# ADR 0020: One npm package, `gyroview`, bundles the core and the adapters

Status: accepted (2026-09-27)

## Context

Sites built with a bundler want `npm install` rather than a hosted script. The code lives in
eight workspace packages (the core, six browser adapters and the player), all private, each
exporting its TypeScript sources to the others. The split serves the dependency rule, not the
users: a page needs the element, the player without the element, and the types those speak.

## Decision

`apps/library` builds and publishes one package, `gyroview`, under the MIT license:

- Vite bundles the player with the core and the adapters into unminified ES modules:
  `dist/index.js` and `dist/define.js`, sharing `dist/player.js`. Three.js and mediabunny stay
  `dependencies` at the versions the adapters are built against (a test compares them), so a
  page that uses Three.js itself shares one copy, and mediabunny's MPL-2.0 files stay in their
  own package.
- `dts-bundle-generator` inlines the workspace packages' declarations into one `index.d.ts`
  that exports only the names `src/index.ts` chooses; the types those need are declared, not
  exported. The build type-checks a consumer (`consumer/usage.ts`, with `skipLibCheck` off)
  against it and lints the manifest with publint.
- `gyroview` has no side effects; `gyroview/define` registers `<gyro-view>` when imported, as
  `gyro-view.js` does.
- A tag `v<version>` publishes it from GitHub Actions through npm trusted publishing, with
  provenance and no stored token.

## Alternatives considered

- Publishing every workspace package under an `@gyroview` scope: eight packages versioned in
  lockstep, each needing a build and declarations of its own, and the internal seams (ports,
  adapters) would become public API that cannot change without a major version.
- Publishing the player package itself: its manifest exports sources and names private
  workspace packages as dependencies; pnpm's `publishConfig` can swap the entry points but not
  the name or the dependencies.
- Bundling Three.js and mediabunny too: one file, but a page using Three.js would ship it
  twice, and MPL-2.0 files would sit inside an MIT package.
- api-extractor (through `vite-plugin-dts`) for the declarations: the same result with a
  heavier toolchain and a report file to maintain.

## Consequences

The package's public API is `apps/library/src/index.ts`: a name the player exports stays
internal until it is added there. The workspace packages keep exporting their sources, so
development needs no build step. The published manifest lists the workspace packages among its
devDependencies at version 0.0.0, which a page's install never reads. The first version is
published by hand, because npm trusts a workflow only for a package that already exists.
