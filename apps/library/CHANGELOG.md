# Changelog

What changed for a page using the package, newest first. Until 1.0, a minor version may change
the API.

## 0.3.1 (2026-09-30)

New:

- Every error has a `category`, derived from its code, that says whose side the failure is on:
  `browser`, `recording`, `source`, `usage` or `internal`; `GYRO_VIEW_ERROR_CATEGORIES` and the
  type `GyroViewErrorCategory` list them. The README's "When a recording cannot play" gives the
  codes of each, and what a `<video>` fallback can and cannot do (ADR 0030).
- The `webcodecs-unavailable` error: the browser has no WebCodecs, on a page not served over
  HTTPS or in an old browser.

What a page may notice:

- A page on plain HTTP, or a browser without WebCodecs, hears `webcodecs-unavailable` where it
  heard `codec-unsupported`, whose message blamed the codec.

## 0.3.0 (2026-09-30)

What a page may notice:

- A recording named by URL is downloaded in file order as it plays, the picture and the sound
  from the same bytes, each fetched about once (ADR 0029). Over a simulated link a little
  slower than an X5 recording at its highest setting (200 Mbit/s against 210), it starts in
  half the time, fetches under half the bytes, and after a seek shows the target in half the
  time, asking for nothing of the old position.

  | State                  | What it downloads                                                     |
  | ---------------------- | --------------------------------------------------------------------- |
  | Loaded, never played   | What opening and the first frame need; with `preload="none"` no frame |
  | Playing                | Up to 10 s or 128 MiB ahead, whichever is less, topped up as it plays |
  | Paused after playing   | On up to that budget, then nothing                                    |
  | A seek                 | The old position's requests end at once; the target first             |
  | Starved by the network | Waits until the next 4 s are downloaded, then plays on                |

- A range that breaks off or brings nothing for 10 s is asked for again from its next byte.

New:

- The `source-changed` error: the recording at the URL was replaced while it played, as its
  `ETag` tells, or else its `Last-Modified` and size. Exposing `ETag` across origins is
  optional, and now named in the CORS advice.

## 0.2.0 (2026-09-29)

What a page may notice:

- The controls are restyled, and fit the player's own width and the pointer (ADR 0028): a
  shaded bar with a thin seek bar, Stabilization and View buttons that show the icon of the
  choice in effect and open menus of the choices with their icons and a line describing each,
  and on a narrow player menus over the whole player and fewer parts; on touch, 44-pixel
  targets.
- The Stop button is gone; `stop()` and the S key remain. `labels.stop` goes with it.
- The theme's defaults follow the new look: `--gyro-view-accent` and `--gyro-view-text` are
  white, `--gyro-view-controls-background` is `rgb(0 0 0 / 60%)` and `--gyro-view-radius` is
  `8px`; `--gyro-view-menu-background` is new. A page's own values keep working.

New:

- `crossorigin` on `<gyro-view>`, with a media element's keywords: `use-credentials` fetches the
  recording, its byte ranges and the other lens's file of a split pair with the visitor's
  cookies, for recordings kept private behind cookies on another origin. `crossOrigin` reflects
  it, `null` while absent. Changing it reloads a recording named by URL; the iframe embed never
  carries it. Nothing changes for a page that does not set it.
- `credentials` on a `UrlInput` (`player.load({ main: { url, credentials: 'include' } })`), in
  place of the player's shared `http.requestInit.credentials` for that recording.
- A `cors` error for a request sent with credentials names what the host must add: the page's
  origin by name, not `*`, and `Access-Control-Allow-Credentials: true`.
- The equirectangular panorama and the raw lenses zoom up to eight times, from four, for fine
  detail in 5.7K and 8K recordings. The normal view keeps its 30 to 120 degrees.
- `messages` takes `stabilizationModeDescriptions`, `viewModeDescriptions` and `labels.close`.

Fixed:

- The raw lenses no longer show a faint grey line along the tiles' edges on Apple GPUs, where a
  player's size put an edge between two pixels the GPU shades together.

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
