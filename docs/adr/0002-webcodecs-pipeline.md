# ADR 0002: Decode with WebCodecs, not with video elements

Status: accepted (2026-09-18); the proxy fallback superseded by ADR 0017

## Context

X4/X5 recordings store the two lens images as two HEVC tracks in one file that must be rendered
as one frame pair. Two `<video>` elements cannot be frame-locked; their `currentTime` is not
frame accurate and each element buffers independently.

## Decision

Demux with mediabunny, decode every lens track with its own `VideoDecoder`, pair output frames by
capture timestamp, and upload `VideoFrame`s to WebGL textures. A hidden `<audio>` element fed by
MSE is the master clock.

## Evidence

The feasibility spike (`docs/FEASIBILITY.md`) decoded 5.7K60 dual-track at ~175 pairs/s and 8K30 at
~100 pairs/s in Chrome and WebKit on an M4 Pro with zero unpaired frames; both tracks carry
identical timestamps.

## Alternatives considered

- Two `<video>` elements with drift correction: rejected for seam flicker at track mismatches.
- Server-side stitching: rejected, the product goal is to play raw files from a plain URL.

## Consequences

HEVC decode is hardware-only in browsers, so capability probing and a proxy fallback are part of
the design. Firefox for Android (no WebCodecs) is out of scope.
