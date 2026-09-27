# gyroview

Play raw Insta360 `.insv` recordings (X3, X4, X5) in the browser. `<gyro-view>` reads the
camera's dual-fisheye file directly, over HTTP byte ranges or from a local file, decodes both
lenses in hardware with WebCodecs, and stitches and gyro-stabilizes them on the GPU. No Insta360
Studio export step.

## Install

```sh
npm install gyroview
```

## Use

Register the element once, then use it like a video element:

```ts
import 'gyroview/define';
```

```html
<gyro-view
  src="https://media.example/VID_20260814_132640_00_013.insv"
  stabilization="lock"
  controls
  muted
></gyro-view>
```

Play a file the visitor picks, without any server:

```ts
const player = document.querySelector('gyro-view');
const input = document.querySelector<HTMLInputElement>('input[type="file"]');
input?.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file && player) player.loadFiles({ main: file });
});
```

`gyroview/define` registers `<gyro-view>` when imported. To choose the moment yourself, for
example in a framework that renders on the server, import `defineGyroView` from `gyroview` and
call it in the browser. The element is browser-only: it extends `HTMLElement`.

The element's events are typed: each is a `CustomEvent` with its payload in `detail`, and
`document.querySelector('gyro-view')` is a `GyroViewElement`.

```ts
player?.addEventListener('ready', (event) => console.log(event.detail.model));
player?.addEventListener('error', (event) => console.log(event.detail.code));
```

Read what a recording holds without playing it: its trailer records, the info record (camera,
firmware, frame rate), the lens calibration and summaries of the gyro and exposure records.

```ts
import { inspectRecording } from 'gyroview';

const fromFile = await inspectRecording(file);
const fromUrl = await inspectRecording('https://media.example/VID_20260814_132640_00_013.insv');
```

For an interface of your own, `createBrowserPlayer` gives the player without the element: it
draws on your canvas, sounds through your audio element and has the same events.

```ts
import { createBrowserPlayer } from 'gyroview';

const player = createBrowserPlayer({ canvas, audio });
player.events.on('timeupdate', (time) => console.log(time));
await player.load({ main: { url: 'https://media.example/VID_20260814_132640_00_013.insv' } });
await player.play();
player.seek(30);
player.lookAt(90, 0);
```

`gyroview` also exports `GyroViewError` with its codes, and the types of the element's settings,
metadata, events and inspection.

## Requirements

- **A secure page.** WebCodecs exists only on `https://` pages, or `http://localhost`.
- **Recordings served in byte ranges.** The server answers `Range` requests with `206`, and
  sends CORS headers when the recordings live on another origin than the page:

  ```
  Access-Control-Allow-Origin: https://your-site.example
  Access-Control-Allow-Methods: GET, HEAD
  Access-Control-Allow-Headers: Range
  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
  ```

- **A hardware HEVC decoder.** 5.7K plays on recent laptops and phones; 8K needs a Level 6
  decoder (Apple Silicon, recent NVIDIA and Intel). A recording the browser cannot decode fails
  with the `codec-unsupported` error.

Desktop Chrome, Edge and Safari, and iOS Safari, are the supported browsers.

## Reference

Every attribute, method, event and keyboard shortcut is in the
[project README](https://github.com/pericamilosevic/GyroView#using-the-player); hosting and the
error codes are in [docs/DEPLOYMENT.md](https://github.com/pericamilosevic/GyroView/blob/main/docs/DEPLOYMENT.md).

## License

MIT
