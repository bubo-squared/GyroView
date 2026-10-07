# ADR 0019: A range that fails on the way is asked for again

Status: accepted (2026-09-27); amended (2026-09-30): while a recording plays, its ranges stream
through `HttpByteStream`, which asks for the rest of a range that broke off from its next byte,
and gives up and asks again for one that brought no byte for 10 s, under the same rules; a
recording replaced meanwhile is `source-changed` (ADR 0029); amended (2026-10-08): a range
answered `429 Too Many Requests`, as rate-limited APIs answer, is asked for again as a 5xx is

## Context

Every picture and every second of sound comes through `HttpRangeSource.read`, and the playback
session treats a failed read as final: `error` is a state it does not leave. On a phone that
changes cells, a hotel Wi-Fi or a server behind a restarting proxy, one connection in several
thousand breaks off or meets a 502, and a long playback ended there, although the same request a
second later would have been answered. Nothing below the adapter retries: mediabunny rejects the
reads waiting on a failed slice, and the audio feeder's failure is sticky.

## Decision

`HttpRangeSource.read` asks again for a range that failed on the way, after 250 ms and then 1 s
(`retryDelaysMs`), and reports the failure only when those are spent:

- **Asked again:** a request that did not get through for want of a network, a body that broke
  off after the headers, a 5xx answer, and a 429 (a server asking the player to slow down). Once a range from the source has come through, a
  failed request is taken as one that failed on the way even when the browser's diagnosis says
  CORS: an error page without CORS headers (nginx's `add_header` without `always`, a CDN's own 502) looks exactly like a CORS refusal, and CORS was already proven for this source.
- **Failed at once:** an abort, any other 4xx, a 200 to a range (`range-unsupported`), a CORS refusal
  before any range came through, and a short body (`source-truncated`). Asking again cannot
  change these: a short body repeats on the next try (ADR 0013).

The failure after the retries keeps its code: `source-unreadable` for the network and the
server, so an embedder can tell a network that is gone from a bad file or a bug.

## Alternatives considered

- Retrying in the session: it would have to know which failures a retry can cure, which only the
  adapter can tell, and every other reader of the source (the audio feeder, the demuxer's
  read-ahead) would need the same.
- Retrying without end: a network that is gone would hold the player in `buffering` for good,
  with no error for the page to act on.
- Reporting a feeder failure only once the sound runs out of what it buffered: the retries cover
  the case it was for.

## Consequences

A blink of the network costs a stalled picture of up to 1.25 s instead of the playback. A server
that keeps failing is asked three times for the range that failed before the player reports it.

## Since 2026-10-05: a range read ahead is asked for again when it is needed

The download reads up to ten seconds ahead of the picture (ADR 0029), so the tries were spent at
the moment of an outage, not when the bytes were needed: a phone that lost its network for two
seconds while reading ahead failed that range, and the playback ended eight seconds later, when
the picture reached it, although the network had long been back. `FileDownload` now tells a range
that failed while a reader waited for it from one that failed while read ahead: the first fails
the read, as before; the second is forgotten when a reader comes to it and asked for once more,
and fails the read only if that fails too. A range gets at most two rounds of three tries, and an
outage while reading ahead costs nothing once it is over.
