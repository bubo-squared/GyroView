# Changelog

What changed for a page using the package, newest first. Until 1.0, a minor version may change
the API.

## 0.1.0 (unreleased)

The first release:

- `<gyro-view>`, registered by `gyroview/define` or `defineGyroView()`, safe to import while a
  server renders the page.
- `createBrowserPlayer`, the player without the element, for an interface of your own.
- `inspectRecording`, which reads what a recording holds from a file or a URL.
- `GyroViewError` and its codes, and the types of the settings, metadata, events and inspection.
