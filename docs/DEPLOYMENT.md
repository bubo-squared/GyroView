# Deployment

GyroView is a static bundle plus recordings served over HTTP. This page lists what each host
must do; `pnpm --filter @gyroview/embed build` produces the files in `apps/embed/dist`.

## What to host

| File                      | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `gyro-view.js`            | The `<gyro-view>` element as one ES module, for pages that use it directly.   |
| `embed.html` + `assets/*` | The iframe target; configured by query parameters, driven over `postMessage`. |
| `embed.js`                | The snippet exposing `GyroView.embed` for pages that embed the iframe.        |
| `index.html` + `assets/*` | The developer page; leave it out of a production deployment.                  |

The bundles are plain files: any static host, object store or CDN serves them. Serve them
with long cache lifetimes under a versioned path; `embed.html` should be revalidated so it
picks up new asset names.

A site built with a bundler can install the npm package `@bubo-squared/gyroview` in place of
`gyro-view.js`; the recordings' host needs the same headers either way.

## The player page must be a secure context

WebCodecs, which decodes the video, exists only in secure contexts: `https://`, or
`http://localhost` during development. A page on plain `http://` shows `codec-unsupported`.

## The media host

Recordings are read in byte ranges straight from the camera's file layout. The server (or
bucket) hosting the `.insv` files must:

- answer `Range` requests with `206 Partial Content` and `Accept-Ranges: bytes`; a server that
  answers `200` with the whole file shows as `range-unsupported`, or as `source-unreadable`
  when `HEAD` gave no length either (a `200` to the one-byte range is as often a fallback page
  as a server that ignores ranges);
- answer `HEAD` with `Content-Length`, which saves a request; a server that refuses `HEAD` (a
  `405`, or a `403` from a URL signed for `GET` alone) or omits the length is asked for a
  one-byte range instead;
- when the player runs on another origin than the recordings, send CORS headers on every
  response. The player's origin is the page's for the element form, and for the iframe form
  the origin serving `embed.html`, whichever site embeds it:

  ```
  Access-Control-Allow-Origin: https://your-site.example   (or *)
  Access-Control-Allow-Methods: GET, HEAD
  Access-Control-Allow-Headers: Range
  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
  ```

  Without them the browser hides the response and the player reports `cors`.

The player asks for every range with `cache: no-store`, so `Cache-Control` and `ETag` on the
recordings matter to CDNs but never to the browser: it must not answer a range from its own
cache (ADR 0013).

The other lens's file of a split-file recording is looked for beside the recording under its
camera name (`..._10_...insv` beside `..._00_...insv`) with a `HEAD` request, only when the
recording turns out to be one half of a pair. The camera's `LRV` proxies need not be hosted:
the player never plays them.

Object stores: enable byte-range serving (on by default for S3, GCS, R2 and Azure Blob) and
add a CORS rule with the headers above. Recordings are large; a CDN in front caches ranges.

## Recordings behind the visitor's cookies

A host that keeps recordings private behind a login or signed cookies (CloudFront signed
cookies, a file server behind a session) answers only a request that carries them. Across
origins the element sends them only with `crossorigin="use-credentials"`, and a page driving
`createBrowserPlayer` only with `credentials: 'include'` on the URL it loads; otherwise, as a
media element's `anonymous` does, the player sends them to the page's own origin alone. They
then go with every request for the recording: its size, its byte ranges and the look for the
other lens's file (ADR 0027). The host must:

- name the page's origin in `Access-Control-Allow-Origin`: the browser refuses `*` for a
  request with credentials, and the player reports `cors`;
- add `Access-Control-Allow-Credentials: true`;
- answer a CORS preflight (`OPTIONS`) without asking for the cookies, which the browser never
  sends with one; browsers differ on whether a `Range` request needs a preflight.

```
Access-Control-Allow-Origin: https://your-site.example
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Allow-Headers: Range
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
Vary: Origin
```

The cookies go only where the browser's cookie rules let them: a host on the same site as the
page (`app.example.com` and `media.example.com`) gets them as it gets any other request's; a
host on another site needs them set `SameSite=None; Secure`, and a browser that blocks
third-party cookies may still hold them back. The `poster` loads as an image does, with the
cookies whatever `crossorigin` says, and local files handed to `loadFiles` are not fetched at
all.

## Embedding

The iframe needs `allow="fullscreen; autoplay"` to fill the screen and to start muted
playback; `GyroView.embed` sets it. The frame trusts one embedding origin: the one the snippet
puts in the URL (`origin=`), or the referrer's. Frames opened directly play standalone.

The frame fetches the recordings itself, so their host must allow the frame's origin (see
above). Host `embed.html` on an origin that holds no credentials for private recordings: any
page may frame it and ask it to load a URL, and the frame fetches with its own origin's cookies,
so a page could learn whether a cookie-protected file exists and what it holds. For the same
reason the frame never takes `crossorigin`: reading with its cookies across origins would hand
every page that frames it what those cookies open on other hosts (ADR 0027). `GyroView.embed` resolves a relative `src` against the embedding page, so a clip next
to a blog post is fetched from the blog's host, across origins from the frame.

A page with a Content Security Policy needs, for the iframe form, `frame-src` for the frame's
origin and `script-src` for `embed.js`. The element form runs in the page itself, so it needs
`script-src` for `gyro-view.js`, `connect-src` for the media host, `media-src blob:` (the sound
plays through a Media Source object URL; without it the player falls back to a silent clock
with a warning), `img-src` for a poster, and no `worker-src` (the player uses no workers). It
needs no `'unsafe-inline'` styles: the element adopts stylesheets it constructs, which
`style-src` does not govern. A page that enforces Trusted Types
(`require-trusted-types-for 'script'`) allows the policy the element parses its own markup
through: `trusted-types gyroview`, with `'allow-duplicates'` if two copies of the player load.

## Error codes

Every failure is a `GyroViewError` with a stable `code`. A failed load or playback arrives as
the `error` event (and as the rejection of `load()`); the rest arrive where they happen:
`playback-blocked` rejects `play()`, and becomes a `warning` event when autoplay, a tap or the
loop meets it; `invalid-argument` is thrown by the call that got the value, or rejects its
promise when it returns one (`scrub()`, every embed handle method); `embed-destroyed` rejects
the embed handle's promises.

| Code                    | Meaning and what to do                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| `cors`                  | The media server answered but forbade this origin: add the CORS headers.     |
| `source-unreadable`     | The URL could not be fetched (network, DNS, wrong URL). A range read that    |
|                         | failed on the way (no connection, a body broken off, a 5xx) was asked for    |
|                         | twice more first (ADR 0019); the first size request is not. Also when the    |
|                         | first frames did not arrive before the decode check's deadline.              |
| `range-unsupported`     | The server ignores `Range`: enable byte-range serving.                       |
| `source-changed`        | The recording at the URL was replaced while it played: its `ETag`, or its    |
|                         | `Last-Modified` and size, changed. Load it again.                            |
| `source-truncated`      | Fewer bytes came back than asked: the server misbehaves, or the file changed |
|                         | where the server does not tell its version.                                  |
| `codec-unsupported`     | This browser cannot decode the tracks (no HEVC hardware, or not a secure     |
|                         | context).                                                                    |
| `missing-second-file`   | One lens of a split-file pair without the other lens's file: set `src2`.     |
| `no-calibration`        | The file carries no lens calibration; it cannot be stitched.                 |
| `invalid-trailer`       | Not an Insta360 recording (a plain MP4, a Studio export), or one cut short.  |
| `no-info-record`        | The trailer holds no info record: a damaged or unusual recording.            |
| `no-key-frame`          | A video track has no key frame to start decoding from.                       |
| `unsupported-container` | The Insta360 trailer reads, but the demuxer cannot read the media tracks.    |
| `unsupported-layout`    | The tracks do not form two lens images the player understands.               |
| `playback-blocked`      | The browser wants a user gesture before sound starts (autoplay policy).      |
| `decode`                | A decoder or the audio buffer failed mid-stream.                             |
| `render-unavailable`    | No WebGL2 context, a shader did not compile or link, or the picture          |
|                         | could not be drawn during playback (a GPU that gave up).                     |
| `invalid-argument`      | A property, method or embed command got a value it does not accept.          |
| `embed-destroyed`       | A command reached an embed handle after `destroy()`.                         |
| `invariant-violation`   | A failure the player did not expect, the original error as its cause.        |

Other codes (`invalid-*`, `unsupported-*`, `binary-*`, `index-out-of-range`) come from a
damaged or unusual file and name the record concerned.
