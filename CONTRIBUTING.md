# Contributing

## Toolchain

- Node 24 LTS (`.nvmrc`; run `nvm use`). dependency-cruiser refuses odd-numbered Node releases.
- pnpm 11 (`packageManager` in `package.json`).
- `pnpm install`, then `pnpm verify` runs everything CI runs: typecheck, lint, format check,
  dependency rules, tests.

## Layout and dependency rule

Hexagonal architecture, enforced by `.dependency-cruiser.cjs`:

- `packages/core`: domain and application code. Pure TypeScript, no runtime dependencies, no DOM
  or Node types in `src` (tests may use Node).
- `packages/adapters/*`: one external technology per package, implementing `core` ports.
- `packages/player`: the `<gyro-view>` element and the composition root.
- `apps/*`: deployable sites. `tools/*`: developer CLIs.

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
