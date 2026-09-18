# ADR 0006: Node 24 LTS for the toolchain

Status: accepted (2026-09-18)

## Context

dependency-cruiser follows the Node release cycle and refuses odd-numbered releases; the
development machine defaults to Node 25. pnpm 11 offers no working per-project runtime pin.

## Decision

`.nvmrc` pins Node 24 LTS; CI uses it through `actions/setup-node`. The pre-commit hook invokes
`lint-staged` directly from `node_modules/.bin` so it works under any Node on PATH.

## Consequences

Contributors run `nvm use` once per shell. No tooling depends on Node 25-only features.

## Addendum (2026-09-18): vitest pinned to 4.x

Stryker 10's vitest runner executes no tests per mutant under vitest 5.0 (the dry run passes,
every mutant "survives" with zero tests run). vitest 4.1 works, so the workspace pins vitest 4
until the runner supports vitest 5. Mutation testing runs on `packages/core` domain code with
`pnpm --filter @gyroview/core test:mutation`; the break threshold is 70%.
