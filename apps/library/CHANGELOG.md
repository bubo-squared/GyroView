# Changelog

What changed for a page using the package, newest first. Until 1.0, a minor version may change
the API.

## Unreleased

- `crossorigin` on `<gyro-view>`, with a media element's keywords: `use-credentials` fetches the
  recording, its byte ranges and the other lens's file of a split pair with the visitor's
  cookies, for recordings kept private behind cookies on another origin. `crossOrigin` reflects
  it, `null` while absent. Changing it reloads a recording named by URL; the iframe embed never
  carries it. Nothing changes for a page that does not set it.
- `credentials` on a `UrlInput` (`player.load({ main: { url, credentials: 'include' } })`), in
  place of the player's shared `http.requestInit.credentials` for that recording.
- A `cors` error for a request sent with credentials names what the host must add: the page's
  origin by name, not `*`, and `Access-Control-Allow-Credentials: true`.

## 0.1.0 (2026-09-29)

The first release:

- `<gyro-view>`, registered by `@bubo-squared/gyroview/define` or `defineGyroView()`, safe to
  import while a server renders the page. It runs under a strict CSP (`trusted-types gyroview`,
  no inline styles), speaks the page's language through `messages`, shows visitors plain failure
  texts and names its overlays as parts. It opens on the raw lenses; the view menu offers them
  first, then the equirectangular panorama and the normal view. The stitch reads the legacy
  calibration string's radius as 96 degrees from the lens axis, where Insta360 Studio's own stitch
  puts the far field; `ready` reports `offset` as the calibration version. The lens pose reads
  the calibration's roll mirrored and turns both lenses alike by their yaw and pitch, which
  removes the step at the side seams of the X5 recordings. The `quality`
  attribute (`fast`, `balanced`, `high`, listed in `PICTURE_QUALITIES`, with `setQuality` and
  `qualitychange`) sets how finely
  the lens images are read and how many device pixels are drawn; `balanced` reads them through a
  mip chain along each pixel's footprint, so fine detail no longer shimmers.
- `createBrowserPlayer`, the player without the element, for an interface of your own, with
  `attachViewGestures` and `attachKeyboard` for the element's gestures and shortcuts.
- `inspectRecording`, which reads what a recording holds from a file or a URL.
- `@bubo-squared/gyroview/standalone`, one file with Three.js and mediabunny inside, for a page
  without a bundler.
- Events in media-element terms, each `warning` with a `code` a page can act on beside its
  message; times, durations and views in plain seconds and degrees.
- `GyroViewError` and its codes (`GYRO_VIEW_ERROR_CODES`), and the types of the settings,
  metadata, events and inspection, with `GyroViewAttributes` for a framework's JSX declaration
  of the element.
