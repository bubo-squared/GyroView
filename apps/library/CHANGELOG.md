# Changelog

What changed for a page using the package, newest first. Until 1.0, a minor version may change
the API.

## 0.1.0 (unreleased)

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
  attribute (`fast`, `balanced`, `high`, with `setQuality` and `qualitychange`) sets how finely
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
