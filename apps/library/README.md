# @bubo-squared/gyroview

Play raw Insta360 `.insv` recordings (X3, X4, X5) in the browser. `<gyro-view>` reads the
camera's dual-fisheye file directly, over HTTP byte ranges or from a local file, decodes both
lenses in hardware with WebCodecs, and stitches and gyro-stabilizes them on the GPU. No Insta360
Studio export step.

## Install

```sh
npm install @bubo-squared/gyroview
```

It brings Three.js 0.186 and mediabunny 1 along. A page that uses Three.js 0.186 itself shares
that copy; any other version means two copies in the bundle, about 128 KB gzipped. The package is
ES modules only: CommonJS code loads it with `import()`.

## Use

Register the element once, then use it like a video element:

```ts
import '@bubo-squared/gyroview/define';
```

```html
<gyro-view
  src="https://media.example/VID_20260814_132640_00_013.insv"
  stabilization="lock"
  controls
  muted
></gyro-view>
```

A relative `src` resolves against the document, as an image's does. `timeupdate` comes four
times a second while playing, as a media element's does; `frame` comes with every picture
drawn.

A page without a bundler loads the standalone file, which has Three.js and mediabunny inside
(about 280 KB compressed) and registers the element; it exports what the package does:

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@bubo-squared/gyroview@0.2/dist/standalone.js"
></script>
<script type="module">
  import { inspectRecording } from 'https://cdn.jsdelivr.net/npm/@bubo-squared/gyroview@0.2/dist/standalone.js';
</script>
```

Bundling it next to a Three.js of the page's own ships two copies; `@bubo-squared/gyroview`
and `@bubo-squared/gyroview/define` share the page's instead.

Play a file the visitor picks, without any server:

```ts
const player = document.querySelector('gyro-view');
const input = document.querySelector<HTMLInputElement>('input[type="file"]');
input?.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file && player) player.loadFiles({ main: file });
});
```

`@bubo-squared/gyroview/define` registers `<gyro-view>` when imported. To choose the moment
yourself, import `defineGyroView` from `@bubo-squared/gyroview` and call it. Both are safe to
import in a framework that renders on the server: there they register nothing, and the element
comes alive once the page runs in the browser.

The element's events are typed: each is a `CustomEvent` with its payload in `detail`, and
`document.querySelector('gyro-view')` is a `GyroViewElement`.

```ts
player?.addEventListener('ready', (event) => console.log(event.detail.model));
player?.addEventListener('error', (event) => console.log(event.detail.code));
player?.addEventListener('warning', (event) => {
  if (event.detail.code === 'autoplay-blocked') showTapToPlay();
});
```

Its words are English until the page gives its own, and a failure shows visitors a plain
sentence while the `error` event carries the diagnostic:

```ts
if (player) player.messages = { labels: { play: 'Lecture' }, errors: { cors: 'Introuvable.' } };
```

Read what a recording holds without playing it: its trailer records, the info record (camera,
firmware, frame rate), the lens calibration and summaries of the gyro and exposure records.

```ts
import { inspectRecording } from '@bubo-squared/gyroview';

const fromFile = await inspectRecording(file);
const fromUrl = await inspectRecording('https://media.example/VID_20260814_132640_00_013.insv');
```

For an interface of your own, `createBrowserPlayer` gives the player without the element: it
draws on your canvas, sounds through your audio element and has the same events.
`attachViewGestures` and `attachKeyboard` give your canvas the element's drags, pinches, wheel
zoom and taps, and its keyboard shortcuts; each returns what removes them.

```ts
import { createBrowserPlayer } from '@bubo-squared/gyroview';

const player = createBrowserPlayer({ canvas, audio });
player.events.on('timeupdate', (time) => console.log(time));
attachViewGestures(canvas, player);
attachKeyboard(canvas, player);
await player.load({ main: { url: 'https://media.example/VID_20260814_132640_00_013.insv' } });
await player.play();
player.seek(30);
player.lookAt(90, 0);
```

The canvas keeps no picture once the browser has shown it: a snapshot (`drawImage`, `toBlob`)
is taken in a `frame` listener, which runs right after each picture is drawn. There are no
buffered ranges to show yet, and no playback rates other than 1.

## How a recording is downloaded

A recording named by URL is read in byte ranges, in file order, as it plays: the lenses and
the sound come from the same bytes, each fetched about once. Until the first play the player
reads only what opening it and showing the first frame need (no frame with `preload="none"`).
Playing, it keeps up to 10 s or 128 MiB ahead, whichever is less, shared by the two files of a
split recording; paused, it reads on to that budget and stops. A seek ends the old position's
requests at once. When the network falls behind the recording, playback waits until the next
4 s are downloaded, and plays on in stretches rather than a frame at a time. A range that
breaks off or stalls for 10 s is asked for again from its next byte, and a recording replaced at
its URL while it plays fails with `source-changed`.

`@bubo-squared/gyroview` also exports `GyroViewError`, the list of its codes
(`GYRO_VIEW_ERROR_CODES`, with `isGyroViewErrorCode` to check a string against it), and the
types of the element's settings, metadata, events and inspection.

## Frameworks

The element takes properties and attributes as any element does, and its events are DOM
events, so a framework needs only to know the tag.

**React 19** sets the attributes and hears events through a ref. For JSX to know the tag, a
declaration file of the project's own extends React's elements with the package's
`GyroViewAttributes`:

```ts
// gyro-view.d.ts
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { GyroViewAttributes, GyroViewElement } from '@bubo-squared/gyroview';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'gyro-view': DetailedHTMLProps<HTMLAttributes<GyroViewElement>, GyroViewElement> &
        GyroViewAttributes;
    }
  }
}
```

```tsx
const player = useRef<GyroViewElement>(null);
useEffect(() => {
  const element = player.current;
  const onReady = (event: CustomEvent<PlayerMetadata>): void => console.log(event.detail.model);
  element?.addEventListener('ready', onReady);
  return () => element?.removeEventListener('ready', onReady);
}, []);
return <gyro-view ref={player} src={url} stabilization="lock" controls muted />;
```

**Vue 3** is told the tag is a custom element (`isCustomElement: (tag) => tag === 'gyro-view'`
in the template compiler options), then binds as usual: `<gyro-view :src="url" controls
@ready="onReady" />`.

**Svelte 5** needs nothing: `<gyro-view src={url} controls onready={onReady} />`.

In every case the element registers in the browser only: import `@bubo-squared/gyroview/define`
in code that runs there, or call `defineGyroView()` once mounted. Importing either while the
server renders is safe and registers nothing.

## Several players on one page

Each player holds a WebGL context and, while a recording is loaded, two hardware video
decoders. Browsers cap both (about sixteen WebGL contexts in Chrome, fewer decoders on phones),
so a gallery gives its players `preload="none"`, which keeps the decoders idle until play, and
loads a recording only for the player in view, removing `src` from the others.

## Requirements

- **A secure page.** WebCodecs exists only on `https://` pages, or `http://localhost`.
- **Recordings served in byte ranges.** The server answers `Range` requests with `206`, and
  sends CORS headers when the recordings live on another origin than the page:

  ```
  Access-Control-Allow-Origin: https://your-site.example
  Access-Control-Allow-Methods: GET, HEAD
  Access-Control-Allow-Headers: Range
  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges, ETag
  ```

  Recordings kept behind the visitor's cookies take `crossorigin="use-credentials"` on the
  element, or `credentials: 'include'` on a URL given to `createBrowserPlayer`'s `load`, and a
  host that names the page's origin, never `*`, and adds
  `Access-Control-Allow-Credentials: true`.

- **A hardware HEVC decoder.** 5.7K plays on recent laptops and phones; 8K needs a Level 6
  decoder (Apple Silicon, recent NVIDIA and Intel). A recording the browser cannot decode fails
  with the `codec-unsupported` error.

The supported browsers, with the oldest versions that have what the player uses (WebCodecs,
WebGL 2, container queries, and on iPhone `ManagedMediaSource` for the sound):

| Browser               | From | Notes                                                    |
| --------------------- | ---- | -------------------------------------------------------- |
| Chrome, Edge desktop  | 107  | HEVC is decoded in hardware from this version on.        |
| Safari on macOS       | 16.4 |                                                          |
| Safari on iPhone/iPad | 17.1 | 16.4 to 17.0 play without sound, with a `warning` event. |

Firefox and Chrome on Android are untested: they play what their decoders accept.

Until 1.0, a minor version may change the API; [CHANGELOG.md](./CHANGELOG.md) says what changed.

## Reference

Every attribute, method, event and keyboard shortcut is in the
[project README](https://github.com/bubo-squared/GyroView#using-the-player); hosting and the
error codes are in [docs/DEPLOYMENT.md](https://github.com/bubo-squared/GyroView/blob/main/docs/DEPLOYMENT.md).

## License

MIT
