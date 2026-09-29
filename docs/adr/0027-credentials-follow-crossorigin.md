# ADR 0027: Credentials follow `crossorigin`, and go with the recording

Status: accepted (2026-09-29)

## Context

Every request the player makes for a recording is a `fetch` with the browser's default
credentials mode, `same-origin`: the visitor's cookies go to the page's own origin and nowhere
else. The element builds its player once, with no request settings, so a page cannot change
that. A site that keeps its recordings private behind cookies on another host (signed CloudFront
cookies, a file server behind a login on `files.example.com` for a page on `app.example.com`)
cannot use `<gyro-view>` at all; only public URLs and URLs signed in their query string play.
`createBrowserPlayer` already takes `http.requestInit.credentials`, but for every recording the
player ever loads.

A media element answers the same need with the `crossorigin` attribute, read when a load starts:
`anonymous` sends cookies to the page's origin only, `use-credentials` to any, which must then
allow the page's origin by name.

## Decision

`<gyro-view>` takes `crossorigin` with the media element's keywords and meaning, and reflects it
as `crossOrigin` the way `HTMLMediaElement` does: `null` while absent, `anonymous` for an empty
or unknown value.

- **The setting belongs to the recording, not the player.** `UrlInput` carries
  `credentials`, in fetch's own terms (`include`); the element sets it from `use-credentials`
  on both `src` and `src2`, and leaves it unset otherwise, so fetch's default applies as before.
  The browser ports merge it over the shared `http.requestInit` for that input's byte source.
- **The other lens's file is read as the main one.** It is the same recording: the lookup
  beside a lone file asks with the lone file's credentials (`RecordingPorts.locatorFor(input)`),
  and the sibling it finds is opened as `{ ...main, url }`. The core's `ResourceLocator` port
  keeps asking only "does this URL exist": credentials are an HTTP concern and stay in the
  adapters and the composition root.
- **Changing it reloads a recording named by URL**, as changing `src` does, since it changes how
  that recording is read. Local files handed to `loadFiles` are not fetched and play on.
- **The iframe embed never carries it.** Any page may frame `embed.html` and ask it to load a
  URL; a frame that read with its cookies across origins would hand every such page what those
  cookies open on hosts that trust the frame's origin (see DEPLOYMENT.md, "Embedding").
- **A CORS refusal of a credentialed request names the stricter rule**: the page's origin by
  name, not `*`, and `Access-Control-Allow-Credentials: true`.

## Alternatives considered

- A player-wide request setting that reads the attribute at request time: the element builds its
  player once, so the setting would change under a load already under way, and the timing
  between an attribute change and the reload it causes would decide which requests carry
  cookies.
- A per-load option of `Player.load`: credentials would travel beside the source instead of with
  the input they belong to, and the other lens's file, found later, would need them handed on
  separately.
- Credentials on the core's `ResourceLocator.exists`: a browser transport notion in the core,
  which knows nothing of HTTP.
- An embed parameter: the security reason above.

## Consequences

A page reaches cookie-protected recordings on another origin with one attribute, in the
vocabulary it already uses for `<video>`. Nothing changes for a page that does not set it. The
host of such recordings must answer with credentialed CORS and must not ask for the cookies on a
preflight, which the browser sends without them.
