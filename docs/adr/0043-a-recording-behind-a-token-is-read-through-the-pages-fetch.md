# ADR 0043: A recording behind a token is read through the page's fetch

Status: accepted (2026-10-08)

## Context

Some hosts answer only a request that carries a token in a header: a cloud drive's download API
(`Authorization: Bearer …`, which such APIs no longer take in the URL), a media server behind
an API gateway, an object store that wants each request signed. `crossorigin` (ADR 0027) covers
cookies only, and a token is short-lived: it is renewed while a recording plays, so a header
fixed when the load starts goes stale. `createBrowserPlayer` already takes a `fetch` of its own
in `http.fetch`, but for every recording the player ever loads, and the element builds its
player without one.

## Decision

A recording read over HTTP may name its own `fetch` (`UrlInput.fetch`, typed `RecordingFetch`):
a function called in place of the platform's `fetch` for every request made for the recording.

- **It belongs to the recording, as credentials do (ADR 0027).** The browser ports put it in
  place of the shared `http.fetch` for that input's byte source and for the look beside it for
  the other lens's file, which is opened as `{ ...main, url }` and so is read the same way. An
  input that names neither `fetch` nor credentials is read with the shared settings themselves,
  so nothing changes for a page that sets neither.
- **The element takes it as a property, `fetch`, set from script.** There is no attribute: a
  function has no text form. Like `crossorigin`, a change loads a recording named by URL again,
  and local files play on; the same function set again changes nothing, so a framework may set
  it on every render. `null` or `undefined` stands for the platform's own; anything else that is
  not a function is refused with `invalid-argument`. A page renews its token inside the function,
  which reads it afresh for each request, rather than by setting another function, which would
  load the recording again.
- **Its contract is the adapter's calls.** It is called on its own, with the URL as a string and
  the request's settings in full (`method`, `headers` with `Range`, `cache: 'no-store'`, the
  load's `signal`, credentials when `crossorigin` sets them), and must pass them on, adding only
  its own headers, and resolve to the server's `Response`. After a failure it may be called with
  `mode: 'no-cors'` to learn whether the server is reachable; browsers send no `Authorization`
  with such a request.
- **The iframe embed never carries it.** A function cannot cross `postMessage`, and the embed's
  reasons for refusing credentials hold for tokens too. The `poster` loads as an image does, not
  through it.
- **An inline handler written on the element keeps the global `fetch`.** Such a handler runs
  with the element in its scope, so the property is hidden from it through
  `Symbol.unscopables`, as the DOM hides `append` and `remove`.

Such APIs limit how fast they answer; a range answered `429 Too Many Requests` is now asked for
again as a server error is (ADR 0019, amended).

## Alternatives considered

- **Headers on the recording** (`UrlInput.headers`, an element `requestHeaders`): fixed when the
  load starts, so a renewed token would need a new load, and a request could not be signed.
- **A service worker on the page**, adding the header to requests for a path of its own: it
  works without the player knowing, but asks every page to install and scope a worker, and
  hides the host's answers behind it.
- **A player-wide setting**, as `http.fetch` is: rejected for credentials in ADR 0027 for the
  same reasons, the timing of a change against a load under way, and the other lens's file.
- **A custom byte source the page implements**: the most general, but it would make the core's
  ports public API (ADR 0020), and every such page would rebuild the retries, the stall
  watch and the version check.

## Consequences

A page plays recordings from hosts that want a token or a signed request, with one property and
the vocabulary of `fetch` it already knows. Nothing changes for a page that does not set it:
each request is the one 0.7.0 made, apart from a range answered `429`, now asked for again. The host must allow the header the page adds in its CORS
preflight (`Access-Control-Allow-Headers: Range, Authorization`); a request with
`Authorization` is always preflighted, so a long `Access-Control-Max-Age` saves a round trip
per range.
