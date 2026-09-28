# ADR 0001: Hexagonal architecture with an enforced dependency rule

Status: accepted (2026-09-18); amended (2026-09-28): the core uses the WHATWG `TextDecoder`
global, which every runtime it runs in has, instead of a UTF-8 decoder of its own.

## Context

The player mixes byte-level format knowledge, geometry, signal processing and several browser
technologies (WebCodecs, WebGL, MSE, fetch) that change independently and are hard to test.

## Decision

`packages/core` holds domain and application code with no runtime dependencies and no DOM or
Node types. `packages/adapters/*` each wrap one external technology and implement ports owned by
the core. `packages/player` is presentation and the composition root. dependency-cruiser fails
the build on violations; the core's tsconfig excludes DOM and Node type libraries.

## Alternatives considered

- A single package with folders: cheaper to start, but nothing stops a shortcut import from the
  shader code into the byte parser.
- Framework-driven structure (React components owning logic): ties the domain to one UI stack.

## Consequences

Parsers and models are testable in milliseconds with in-memory sources. Adapters need contract
tests against both fakes and real implementations. The core's types name neither the DOM nor Node:
a platform global it uses (the WHATWG `TextDecoder`, which browsers, Node and Deno all have) is
declared where it is used, as narrowly as it is used.
