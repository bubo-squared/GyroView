# ADR 0010: A headless player composed at the element, embedded over a versioned message protocol

Status: accepted (2026-09-20); the proxy fallback and the `quality` setting superseded by ADR
0017

## Context

Phases 1 to 4 produced a dependency-free core and one adapter per technology. Something has to
wire them together for a browser, present a media-element-like surface to page authors, and
let a page on another origin drive a player it cannot script directly. Three things had to be
decided: where composition happens, what the element is, and how an iframe is driven.

## Decision

**Composition lives in `packages/player`, in two layers.** `openRecording` is the use case at
the composition root: it opens the inputs, reads the trailer, demuxes, detects the layout,
requires a calibration, proves decodability with the probe, resolves frame times and
integrates the gyro. It depends on ports (`SourceOpener`, `Demuxer`, `VideoDecoderPort`,
`ResourceLocator`, a deadline factory), so it is tested in the browser against fakes and the
synthetic X5-trailer fixtures, not against the network. `buildPipeline` then assembles the
running parts (clock, renderer, stabilizing sink, session), and `Player` is the headless facade
over one loaded recording with media-element semantics (`load`, `play`, `seek`, events named
as `HTMLMediaElement` names them). `GyroViewElement` is a thin facade over `Player`: attributes
in, `CustomEvent`s out, controls and gestures bound to the element's shadow tree.

**Data decides fallbacks, settings only allow them.** A lone half of a split-file pair fetches
its sibling when detection says so and the server has it; a recording this browser cannot
decode falls back to the proxy only when `quality` is `auto`; the proxy is looked for beside a
URL only when `proxy` is `auto`. Every degraded path is a `warning` event, so embedders know
what they got.

**Frame times are resolved in two steps.** The exposure record is tried first (one small
read); the video track's own timestamps, which cost a walk of the sample table, are fetched
only when the cheap sources leave nominal spacing as the answer.

**Decoding asks for no hardware preference.** `prefer-hardware` makes WebCodecs refuse codecs
the browser could decode in software (H.264 proxies on machines without a hardware decoder);
with no preference the browser still picks hardware when it has one.

**Embedding uses a versioned `postMessage` protocol.** Messages carry `protocol: 'gyro-view/1'`
and a `kind` (`hello`, `command`, `result`, `event`); everything received is validated before
use: every command argument and field by type, event names against the forwarded list, error
codes against the known ones. An event's payload from the pinned frame is trusted once its
message has passed those checks. The frame trusts one origin: the one the snippet names in the URL, or
the referrer's, never `*`; a frame with neither plays standalone without a bridge. The page
trusts only the frame's origin and window, looked up at each message: an iframe moved within
its page loads anew in a window of its own. Commands sent before the frame's first `hello` wait
for it; the `hello` carries the element's state, which the page's mirror starts from (a frame of
an earlier build sends none, and the mirror starts from the defaults). A second `hello` is a
frame that loaded anew from its URL's options: the page asks it again what the old one left
unanswered, and the frame runs each command id once, since a command sent just before that
`hello` may have reached it already. Each command names the oldest the page still waits on, so
the frame forgets the ids below it instead of remembering every command for its whole life.
Errors cross the boundary as `{ code, message }`, so the codes stay stable on both sides.

## Alternatives considered

- Composing inside the element class: one class would own I/O, decoding, rendering and DOM;
  the headless `Player` keeps the element to attributes and events and lets tests drive the
  same object the element does (the embed bridge drives the element).
- `prefer-hardware` decoding, as planned: refused the H.264 test fixtures in Playwright's
  Chromium and would refuse proxies on machines without hardware H.264.
- Transferring a `MessagePort` to the frame for the bridge: cleaner isolation, but the
  handshake still needs an origin-checked `postMessage`, and `EmbedHost`/`EmbedHandle` already
  run over a port in the tests; it can be adopted later without changing the protocol.
- Auto-detecting the embedder from the referrer alone: browsers may strip it; the snippet
  therefore names the origin in the URL and the referrer is the fallback.
- Always fetching the track timestamps for frame times: correct, but a sample-table walk per
  load on files that carry an exposure record anyway.

## Consequences

`packages/player` is the only package that imports several adapters; `apps/*` import the
player, never the adapters (dependency-cruiser). The player tests need Chromium and WebKit,
like the adapters'. The embed protocol is public API: an incompatible change is a new protocol
name, and a field added under the same name is optional on receipt.
Orientation integration runs on the main thread while loading: measured at 90 ms for the
262 000 samples of a four-minute clip, so no worker is needed. Phase 6 added the buffering
state (sound waits for the picture), key-frame scrubbing, per-channel gain matching along the
seam and a `cors` diagnosis, all behind the same element and protocol surface.
