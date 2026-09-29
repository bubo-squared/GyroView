# ADR 0029: The player reads the sample tables and downloads the bytes itself

Status: proposed (2026-09-30)

## Context

A recording played over HTTP reaches the decoders through one `HttpRangeSource` per file under
one mediabunny `Input` (ADR 0003): a `CustomSource` with network prefetching, an 8 MiB cache,
two read slots and a queue of reads. Three readers pull through it, each at its own position:
the two lenses' packet sinks and the audio track's, which re-packages sound for the audio clock
(ADR 0007). Nothing coordinates them, and nothing cancels a read once it is asked for.

Measured on the office recording (210 Mbit/s, a key frame every 2 s), against the file itself
and over a simulated 200 Mbit/s link:

- **Sound drags the picture along.** Audio packets of 505 bytes sit between the video frames,
  one every 556 KB. The audio feeder keeps 30 s buffered from the moment the recording opens,
  paused or not, and every read the prefetcher widens to half a mebibyte or more: 10 s of sound
  (24 KB of audio) read 270 MB of file, and a pause after 3 s was followed by 889 MB more over
  the next 52 s. The cache holds 0.3 s of this recording, so the picture fetches the same bytes
  again when it gets there: 1.89 times the recording's bytes over a playback.
- **A seek leaves its old reads running.** After a seek to 150 s, seven requests (25 MB) for
  the old position went out and one 8 MB request was left to finish; the first frames at the
  target came 3.7 s later on a 200 Mbit/s link, more with the audio feeder refilling from the
  new position.
- **A read delivers nothing until its whole range has come.** `HttpRangeSource.read` answers
  with the whole body, and the prefetcher asks for up to 8.4 MB at once, so a frame at the start
  of a range waits for its end.

mediabunny serves each track's packets through its own reading of the sample tables and does
not say where a packet lies in the file; its read orchestrator cancels reads only when the
whole `Input` is disposed.

## Decision

The player reads the file's sample tables itself and downloads each file in file order, as one
download per file that is the only reader of the network while the recording plays.

- **The sample tables are the core's.** The format layer parses the movie box (`moov`: the
  track headers and every sample table, including 64-bit chunk offsets, composition offsets and
  edit lists) into a `SampleTable`: for every sample of every track, where it lies, when it
  plays and whether decoding may start there. The movie box is read once while the recording
  opens, beside the trailer it sits next to.
- **One download per file, in file order.** A `FileDownload` knows where every consumer stands
  (the lenses' packet readers and the sound's sample reader, each a cursor) and requests, in
  file order, the ranges they need within a window ahead of the picture, in requests of at most
  8 MiB, two at a time. Sound needs nothing of its own: its samples lie between the frames the
  picture needs, and it is served from the same bytes.
- **What no cursor needs any more is cancelled at once.** A seek releases the old cursors and
  aborts their requests before the new position is asked for. Requests stream: each sample is
  handed on as soon as its last byte has arrived.
- **The download follows a budget in time and bytes.** Ahead of the picture it keeps at most
  10 s or 128 MiB, whichever is less, and tops up below three quarters of that; behind it keeps
  2 s for short backward seeks. Paused after playing, it goes on up to the budget and stops.
  Before the first play it downloads only what opening, the decode probe and the first picture
  need, and nothing of that last with `preload="none"`.
- **mediabunny keeps what it does well.** It reads the decoder configurations and codec strings
  from the movie box held in memory, re-packages sound as fragmented MP4 for Media Source
  Extensions (ADR 0007), and in tests is the reference the core's sample tables must agree with,
  sample by sample, on every fixture and real recording.

## Alternatives considered

- Keeping mediabunny's reader with a larger cache and a short audio lead: measured at 1.01
  times the recording's bytes, but its reads still cannot be cancelled, its scheduling is its
  own heuristics (widening, slot count, gap tolerance) that may change in any release, and no
  test can assert that a seek leaves no request behind.
- A new mediabunny `Input` per seek, whose disposal cancels its reads: every seek parses the
  movie box again, and the three readers still pull independently.
- Reading packet positions from mediabunny's internals: they are not its public API and would
  break on an upgrade.
- One open-ended request per file (`Range: bytes=N-`): backpressure and idle timeouts behave
  differently across browsers and CDNs, a retry restarts from further away, and pausing leaves
  a connection open.
- Media Source Extensions for the picture as well: pairing the lenses frame by frame and timing
  each frame against the gyro need decoded frames with exact timestamps (ADR 0002).

## Consequences

The core owns a parser for the part of ISO BMFF that `.insv` files use; a fragmented file is
refused. Every byte of a recording played through is fetched about once, a pause and a seek
leave nothing downloading beyond the budget, and the first frame after a seek arrives as soon as
its own bytes do. The limit that remains is the link: a recording plays without pausing only
where the network keeps up with its bit rate, 210 Mbit/s for the X5 at its highest setting.
