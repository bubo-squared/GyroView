# ADR 0040: The phone is a window into the normal view

Status: accepted (2026-10-05)

## Context

On a phone the normal view turned only by drags. A viewer holding a phone expects what YouTube's
360 player and other "magic window" players do: turn the phone and the view turns with it. The
browser reports the device's attitude through `deviceorientation` events (W3C DeviceOrientation
Event Specification): three Euler angles of the device in a frame whose z points up, relative to
where the device started on iOS and in Chromium's default event, and the screen's own turn in
`screen.orientation.angle`. iOS sends nothing until the page asks with
`DeviceOrientationEvent.requestPermission()` during a tap. Chromium now has that method too, but
sends its events without it: one at once with the angles on a phone, or without them where there
is no sensor. A desktop WebKit declares the event and sends nothing. Every browser reports the
attitude only in a secure context, and in a cross-origin frame only where the frame's `allow`
names the sensors.

## Decision

- **A toggle, off until pressed.** Motion look is a setting the player keeps across loads (ADR
  0016), `unavailable`, `off` or `on`, announced as `motionlookchange`. The control bar shows a
  toggle for it, pressed while on, only in the normal view and only where the device reports its
  attitude. iOS would ask at the first press anyway; turning it on by itself elsewhere would make
  the platforms behave differently.
- **The screen is a window.** The device's whole attitude turns the view, its roll included, so
  the horizon stays level with the real one. Dropping the roll would let the picture spin when the
  phone points near straight up or down, where yaw and roll trade places. `screenLookOf`
  (`core/domain/view/screenLook.ts`) turns the browser's angles and the screen's turn into the
  view's yaw, pitch and roll: the rotation `W Rz(alpha) Rx(beta) Ry(gamma) Rz(-screen) V`, read
  back as `Ry(yaw) Rx(pitch) Rz(roll)`; at a pole, where only their sum or difference is defined,
  the turn is taken as yaw alone.
- **The heading is the view's own.** Only the device's changes of yaw turn the view, so starting,
  a drag, the arrows, Reset view and a page's `lookAt` move the heading and the device carries on
  from there. Pitch and roll are the device's. Two consecutive readings more than half a second
  apart start anew without a sideways jump: iOS and Android count the yaw from a new zero when the
  sensor restarts, and a hidden page hears nothing; a main thread held up that long, by a seek or a
  decoder starting, loses the turn made meanwhile. A turn under a hundredth of a degree is not
  drawn, though its reading still counts as heard, so a phone at rest does not redraw the stitch at
  the sensor's rate, and a slow drift lands in full once it shows.
- **While the device holds the view** (`MOTION_LOOK_VIEW`, from its first reading until it lets
  go): sideways drags and arrows turn the heading, up and down is the device's, a zoom narrows
  about the centre, Reset view looks ahead at the default zoom, and a page's view sets the yaw and
  the field of view but not the pitch. Turning motion look off, leaving the normal view or
  unloading lets go: the view stays where it looks, level.
- **The roll stays inside the player.** `ViewState` gains `roll`, which only motion look sets;
  the view a page sees and sets (`view`, `viewchange`, the attributes, the bridge) keeps yaw, pitch
  and field of view, as published.
- **Available means heard.** The page's probe (one per page) listens until it hears the angles:
  then the device is available, and the probe stops and forgets its listeners. An event without
  them means no sensor. Before anything is heard, a touch device whose browser can ask for
  permission is taken to have the sensors (iOS); anything else is not. Neither is a frame whose
  policy Chromium says refuses the accelerometer or the gyroscope, where it sends no event at all;
  iOS does not say, and refuses at the first press. Access is asked for only where the events wait for it, as the first thing in the
  press: an `await` before it would leave the gesture behind. A refusal makes motion look
  unavailable with a `motion-look-refused` warning; a start outside a gesture leaves it off with
  `motion-look-needs-gesture`. Neither rejects.
- **The page holds the player only while it draws.** The player follows the sensor's
  availability while a recording is drawn, and hears its readings while motion look is also on and
  the normal view shown; an element taken out of the page unloads and lets go of both, so it can be
  collected. `motionLook` is the availability as last known, read afresh by `startMotionLook()`.
  The player disposes the sensor with itself.
- **Embedding.** The snippet's iframe allows `accelerometer; gyroscope; magnetometer` beside
  `fullscreen; autoplay`. The bridge mirrors `motionLook` but has no command to start it: a tap on
  the embedding page does not activate a cross-origin frame, so iOS would refuse; the frame's own
  toggle serves. `viewchange` crosses `postMessage` as often as the device turns the view, about
  60 times a second, as a drag's do; a small message costs microseconds, so the frame does not
  throttle it.
- **The bar** gives up its parts one target sooner while the toggle shows, keyed on the toggle
  being shown (`:has()`) rather than on the pointer, since a laptop with sensors may have a mouse;
  on the narrowest players the stabilization menu gives way to it. The toggle never hides while
  the device turns the view, which a phone turned to portrait would otherwise leave it doing with
  no way out but the View menu.

## Measured

`measure/motionLookPacing.test.ts` plays the X5 sailing recording (8K30) and the office recording
(5.7K60) in a 1280 by 720 canvas, headless on the developer machine, with a scripted device: a
hand turning at 60 readings a second, the same in bursts of four readings every 16 ms, and a
phone at rest. Canvas draws a second and the GPU's milliseconds a second, sailing, playing:

| Device                 | Chromium draws | Chromium GPU | WebKit draws | WebKit GPU |
| ---------------------- | -------------- | ------------ | ------------ | ---------- |
| Motion look off        | 30             | 347          | 29           | 184        |
| Turning, 60 a second   | 58             | 495          | 52           | 316        |
| Turning, 4 every 16 ms | 58             | 501          | 52           | 313        |
| At rest                | 30             | 365          | 30           | 196        |

No animation frame drew the stitch twice in any case, in either browser, so bursts of readings
cost nothing more (ADR 0035). The recording kept its pace: 29.7 pairs a second in Chromium and
28.3 to 28.7 in WebKit, none skipped. Paused, a turning device draws once a frame (58 and 48 a
second) and one at rest as little as motion look off (0.3). The office recording draws at about
the display's rate whether the view turns or not. Hearing a reading takes under 0.1 ms. With
motion look off, `measure/framePacing.test.ts` paces both recordings on this change as before
it, within the run-to-run spread.

## Alternatives considered

- **Yaw and pitch from the phone, no roll**: the view's state would not change, but the picture
  spins near the zenith and rolls with the hand.
- **On by default**: Android could start at once, iOS not; and a viewer who did not ask would see
  the picture move as they walk.
- **A drag turning motion look off**: it would leave no way to look behind without turning
  around.
- **Absolute orientation (`deviceorientationabsolute`)**: north-referenced, but the compass jumps
  near metal and indoors; the heading only needs changes.
- **Publishing the roll**: a larger public view, and `setView` would need a roll a page has no
  use for.

## Consequences

A phone held up shows the recording as a window; stabilization `lock` or `horizon` keeps the
recording's horizon level with the real one, `off` and `follow` show the camera's own tilt.
`viewchange` fires at the sensor's rate on the element, its yaw swinging near the zenith where
the roll takes up the turn. A Chromium touch device without sensors may show the toggle for the
moment before its first event says so. The design rests on emulated sensors and synthetic events;
the iPhone and Android runs, both orientations, the embed and a phone's heat over minutes are on
the roadmap.
