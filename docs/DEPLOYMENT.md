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

## The player page must be a secure context

WebCodecs, which decodes the video, exists only in secure contexts: `https://`, or
`http://localhost` during development. A page on plain `http://` shows `codec-unsupported`.

## The media host

Recordings are read in byte ranges straight from the camera's file layout. The server (or
bucket) hosting `.insv` and `.lrv` files must:

- answer `Range` requests with `206 Partial Content` and `Accept-Ranges: bytes`; a server that
  answers `200` with the whole file shows as `range-unsupported`;
- answer `HEAD` with `Content-Length`, or with `405`, in which case a one-byte range is asked
  for instead;
- when the page is on another origin, send CORS headers on every response:

  ```
  Access-Control-Allow-Origin: https://your-site.example   (or *)
  Access-Control-Allow-Methods: GET, HEAD
  Access-Control-Allow-Headers: Range
  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
  ```

  Without them the browser hides the response and the player reports `cors`.

The camera's companion files are looked for beside the recording under their camera names
(`LRV_..._01_...lrv` for the proxy, `..._10_...insv` for the other lens of a split-file
recording), with `HEAD` requests. Both are optional.

Object stores: enable byte-range serving (on by default for S3, GCS, R2 and Azure Blob) and
add a CORS rule with the headers above. Recordings are large; a CDN in front caches ranges.

## Embedding

The iframe needs `allow="fullscreen; autoplay"` to fill the screen and to start muted
playback; `GyroView.embed` sets it. The frame trusts one embedding origin: the one the snippet
puts in the URL (`origin=`), or the referrer's. Frames opened directly play standalone.

A page with a Content Security Policy needs `frame-src` for the frame's origin, `script-src`
for `embed.js` and, for the element form, `connect-src` for the media host and
`worker-src`/`child-src` nothing (the player uses no workers).

## Error codes

Every failure is a `GyroViewError` with a stable `code`; the `error` event carries it.

| Code                  | Meaning and what to do                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `cors`                | The media server answered but forbade this origin: add the CORS headers.     |
| `source-unreadable`   | The URL could not be fetched (network, DNS, wrong URL).                      |
| `range-unsupported`   | The server ignores `Range`: enable byte-range serving.                       |
| `source-truncated`    | Fewer bytes came back than asked: the file changed or the server misbehaves. |
| `codec-unsupported`   | This browser cannot decode the tracks (no HEVC hardware, or not a secure     |
|                       | context); a proxy plays instead when one exists and `quality` is `auto`.     |
| `missing-second-file` | A split-file recording without its `_10_` sibling: set `src2`.               |
| `no-calibration`      | The file carries no lens calibration; it cannot be stitched.                 |
| `no-info-record`      | Not an Insta360 recording (or a truncated one).                              |
| `unsupported-layout`  | The tracks do not form two lens images the player understands.               |
| `playback-blocked`    | The browser wants a user gesture before sound starts (autoplay policy).      |
| `decode`              | A decoder or the audio buffer failed mid-stream.                             |
| `render-unavailable`  | No WebGL2 context, or the stitching shader did not compile.                  |

Other codes (`invalid-*`, `unsupported-*`, `no-frame-times`, `record-not-found`) come from a
damaged or unusual file and name the record concerned.
