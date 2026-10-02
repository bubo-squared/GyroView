# ADR 0037: An HEVC track's codec string is the core's, read from the SPS where the configuration's header is blank

Status: accepted (2026-10-03), seen on one Antigravity A1 recording

## Context

The decoder is configured with a codec string, `hev1.1.6.L183.80` for an X5 at 8K, that names
the stream's profile, tier and level. mediabunny builds it from the header of the track's `hvcC`
box, the HEVC decoder configuration, which ISO/IEC 14496-15 §8.3.3.1 says repeats the SPS's
profile_tier_level. The Antigravity A1 leaves that header blank: profile 0, no compatibility or
constraint flags, level 0. Its SPS declares what the X5's does at 8K, Main at level 6.1.
mediabunny then names the codec `hev1.0.0.L0`, which Chrome and WebKit refuse; the player failed
with `codec-unsupported` and blamed the browser. Both decode the stream once told
`hvc1.1.6.L183.80`, with the camera's own box, blank header and all, as the description.

## Decision

- **The core names an HEVC track's codec** (`hevcCodecStringOf` in `format/mp4`): from the
  configuration's header, or, where the header names no profile (no profile has the number 0,
  ITU-T H.265 Annex A), from the first SPS the configuration carries, its emulation prevention
  bytes dropped. The string is spelled as ISO/IEC 14496-15 Annex E.3 spells it.
- **It begins with the track's sample entry type**, as Annex E.3 has it: `hvc1` on every camera
  seen. mediabunny wrote `hev1` for every HEVC track; Chrome and WebKit accept both for every
  camera's profile, tier and level.
- **The mediabunny adapter takes it for HEVC tracks** and passes the file's configuration to the
  decoder unchanged. Other codecs keep mediabunny's string.

## Alternatives considered

- Mending mediabunny's string only where the header is blank: two builders of one string, and a
  check on mediabunny's output to decide between them.
- Filling the header in from the SPS before configuring the decoder: the decoders do not need
  it, and the bytes they are given stay the file's.
- Waiting for mediabunny to read the SPS here, as it does for a stream without a configuration
  box: worth proposing upstream, but the recording should play meanwhile.

## Consequences

- Every HEVC recording's codec string begins with its sample entry type, `hvc1` on every camera
  seen, rather than `hev1`; its profile, tier and level are those it had. The `ready` event's
  `tracks[].codec` shows it: a page matching on `hev1` notices.
- A blank header in a configuration without an SPS (an `hev1` track may keep its parameter sets
  in the stream), or whose parameter sets run past its end, still names profile 0 and is refused
  as before (`codec-unsupported`).
- An encrypted track, its sample entry `encv`, keeps mediabunny's string.
