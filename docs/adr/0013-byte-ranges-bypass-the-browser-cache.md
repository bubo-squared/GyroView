# ADR 0013: Byte-range reads bypass the browser's HTTP cache

Status: accepted (2026-09-21)

## Context

The player reads a recording in byte ranges with `fetch`. Browsers keep the `206` answers to
one URL as a sparse cache entry and, when a later range overlaps it, revalidate with a
conditional request (`If-None-Match`, `If-Modified-Since`); a `304` makes them answer from
the entry. Vite's dev server sends `Cache-Control: no-cache` with a weak `ETag` and answers
`304` to any matching conditional request, whatever the `Range`; production servers and CDNs
commonly behave the same way.

With a Chrome profile that has a disk cache, the first seek into the office recording failed
with `source-truncated`: "returned 0 bytes for a 458752-byte range". Chrome had asked
conditionally for a range it believed it held, received `304`, and handed the page a `206`
whose body from the sparse entry was empty. The demuxer re-reads bytes near ones it read
before on every seek (both lenses' key frames sit together) and now and then during ordinary
playback, so the fault showed on every seek and occasionally without one.

## Decision

Every request the fetch adapter makes for a recording or a companion file carries
`cache: 'no-store'` (only the probe that tells a CORS refusal from a network failure does not,
since it reads nothing): the browser neither
consults nor fills its cache for them. Nothing is lost, because the demuxer keeps its own
cache of the bytes it needs (mediabunny, 8 MiB with network prefetching) and a
multi-gigabyte recording would not fit a browser cache anyway. Embedders who know their
server can choose another mode through the shared `requestInit`.

## Alternatives considered

- Fixing the dev server's headers (`Cache-Control: no-store` on media): cures one server,
  while the player has to survive any host.
- Cache-busting query parameters: break signed URLs and CDN caching, and the sparse-entry
  path would still be taken for the first request of each range.
- Retrying a short read: hides the fault and repeats it on the next range. (A range that fails
  on the way, a broken-off body or a server error, is another matter: ADR 0019.)
- Rejecting on a `Content-Range` mismatch: a correct diagnosis and no playback.

## Consequences

A reloaded page fetches the recording's bytes again instead of taking them from the browser
cache, which for these files it never did in practice. Companion-file probes are uncached
too: a `HEAD` each, and a one-byte `GET` where a server refuses `HEAD`. The player bundle itself is served and cached as before; only
the fetch adapter's requests are affected.
