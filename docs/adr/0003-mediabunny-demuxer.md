# ADR 0003: mediabunny as the demuxer

Status: accepted (2026-09-18)

## Context

Reading MP4 sample tables over HTTP range requests and producing WebCodecs chunks with the
right `description` is intricate and well served by libraries.

## Decision

Use mediabunny (TypeScript, MPL-2.0, WebCodecs-native): `UrlSource` and `BlobSource` for ranges,
`EncodedPacketSink` for packets and keyframe lookup, `getDecoderConfig()` for decoder setup.

## Alternatives considered

- mp4box.js: mature but the consumer drives fetching and must stop appending before the trailer.
- web-demuxer (FFmpeg in WebAssembly): 0.5-1 MB gzip and an opaque range strategy.

## Consequences

mediabunny opened the `inst`-wrapped files in the spike without special handling. If a bare
trailer ever breaks it, the `RandomAccessSource` can present a view truncated at the trailer.
