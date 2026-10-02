# ADR 0035: A changed setting is drawn once an animation frame

Status: accepted (2026-10-02)

## Context

The renderer drew the stitch again at every change of its settings: each step of a drag, a
pinch or a wheel turn, each lens gain that gain matching applied, each quality or view mode. A
frame of the recording is drawn when it is presented, inside the player's animation frame, so a
view change in the same frame drew the whole stitch a second time, and the screen showed one of
the two.

Measured on the developer machine with the X5 sailing recording (8K30) in the normal view, a
1280 by 720 page at two device pixels per CSS pixel:

| A drag while playing                                        | Draws a second | Animation frames a second | Frames of the recording shown a second |
| ----------------------------------------------------------- | -------------- | ------------------------- | -------------------------------------- |
| Chromium, before                                            | 91             | 60                        | 30                                     |
| WebKit, pointer events at 120 a second, before              | 117            | 60                        | 30                                     |
| WebKit, pointer events as fast as a test sends them, before | 2779           | 10                        | 8                                      |
| Each of the three, after                                    | 60             | 60                        | 30                                     |

Chromium hands the page one pointer move per animation frame, and half of all frames were drawn
twice. WebKit hands it every move: a fast mouse starved the animation frames, and with them the
frames of the recording. Gain matching drew one extra stitch every half second while playing.

## Decision

- The renderer draws a changed setting when its `DrawSchedule` says. The adapter offers
  `DRAW_AT_ONCE`, its default; the player's composition gives each renderer an
  `AnimationFrameDraws`, which draws once at the next animation frame however many changes come
  before it, on the same `FrameScheduler` the player's `FrameLoop` ticks on.
- A presented pair is drawn at once and cancels the draw the schedule holds, so a frame that
  presents draws once. A new drawing buffer size is drawn at once as well: resizing clears the
  canvas, which would otherwise stay blank until the next frame. Disposing gives up the draw
  held.
- The tests and the lab renderer keep `DRAW_AT_ONCE`: they read the canvas right after a change.

## Alternatives considered

- Coalescing in the player's gesture handling: it would leave the gains, the quality and the
  view mode drawing at once, and every page driving the player's view API would need it too.
- Drawing the changed settings from the player's `FrameLoop` tick, after the session's: one
  callback a frame instead of two, but the renderer would have to say whether it holds a change,
  the session's presentation would still draw at once, and the tick, which knows the session,
  would have to know the renderer as well.

## Consequences

- A drag, a pinch or a wheel turn costs one stitch a frame on every browser, and the frames of
  the recording keep their pace however fast the pointer reports.
- A change shows at the next animation frame rather than at the event. The screen shows nothing
  sooner either way: Chromium dispatches the events of a frame before its animation frames run,
  and WebKit's events between frames reach the screen at the next one.
- A frame that presents draws once because the schedule's callback runs after the `FrameLoop`'s,
  which was requested a frame earlier: the changes made by events and by gain matching's
  read-back come after it. A setting changed inside the tick after the presentation, as a
  future animated view might, would draw once more in the next frame.
- `ThreeFrameRendererOptions` holds the context's options and the draw schedule; a schedule
  serves one renderer.
