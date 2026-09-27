# ADR 0007: The audio element, fed through Media Source Extensions, is the master clock

Status: accepted (2026-09-18); amended (2026-09-27): a seek within the buffered audio appends
from where the buffer ends, and nothing at all once the ended stream holds the rest of the track

## Context

Playback needs one clock that sound and picture follow, with the volume, mute and rate
behaviour users expect from a media element. The recording's AAC track sits inside a multi-GB
`.insv` whose video the browser cannot play on its own, so the audio has to be extracted and fed
to the element by the player.

## Decision

A hidden `<audio>` element is the `PlaybackClock`. Its data comes through Media Source Extensions
(`ManagedMediaSource` where it exists, `MediaSource` otherwise). The mediabunny adapter re-packages
the audio packets, unchanged, into fragmented MP4 (`AudioSegmentSource`): an initialization
segment followed by one-second `moof`/`mdat` fragments, starting at any requested time. Segments
are taken from the muxer's box callbacks, not from its byte stream, so each is a whole box and
the trailing `mfra` index (which MSE rejects) never appears. Fragmented output keeps the track's
timestamps, so a run started at a seek point lands at its true position without offsets. The
audio clock adapter pulls segments only while less than a buffer-ahead window is buffered past
the playhead and restarts the run on every seek. Recordings without audio use the `WallClock`.

## Alternatives considered

- The `.insv` URL as the element's `src`: browsers fetch and try to decode the two HEVC tracks
  as well; Safari refuses files with several video tracks; no control over what is buffered.
- Re-packaging the whole audio track up front into a Blob URL: the AAC samples are interleaved
  with video chunks every second, so the whole file would be touched (thousands of range
  requests) before playback could start.
- Web Audio scheduling of decoded frames: needs `AudioDecoder`, absent in Safari before 26;
  drift between `AudioContext.currentTime` and scheduled buffers; volume and rate reimplemented.
- The wall clock alone: no sound.

## Consequences

Every seek costs one initialization segment and a round trip for the first fragment, about one
second of audio. iPhone requires `ManagedMediaSource`; browsers without any media source get the
wall clock and no sound. Codec support for MSE is probed with `isTypeSupported`, separately from
video decoding. Starting playback may be refused by autoplay policy; the clock reports that as
`playback-blocked` so the player can wait for a gesture.
