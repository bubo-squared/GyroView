# ADR 0021: Changes are announced once they are whole

Status: accepted (2026-09-28)

## Context

The playback session and the player emitted their events in the middle of the methods that
caused them: `setState` announced `seeking` before `seek` had decided where it lands, and a
listener that sought again, paused or loaded something else ran right there. Every line after
an announcement had to ask whether the world it was about to change was still the one it had
announced: fourteen re-checks and thirteen comments of the kind "a listener may have...", a
counter in the relay that cut a change's events short when a listener made a newer one, and a
guard for every new transition. Several fixes in the history were such a guard forgotten.

## Decision

A change is made whole before anyone hears of it. `Outbox` (core, `shared/events`) holds what a
change announces and delivers it once the outermost change is complete; a method that changes
state runs as one change, so the code after an announcement reads its own state, never a
listener's.

- **A listener's own change supersedes.** A change a listener makes while it hears one drops what
  the older change still had to announce, once it announces something itself: the newer change
  reports itself. A listener that seeks on `seeking` hears no time update of the seek it replaced;
  one that starts over on `ended` hears no `ended` event.
- **The clock starts after `playing` is heard.** The one step that waits for listeners is the
  start of the clock: `play` announces `playing` and starts the clock a microtask later, unless a
  listener paused meanwhile. An audio element told to pause while it starts rejects the start,
  which would surface as a failed play.
- **Statuses are deduplicated when heard.** The player announces a status only if it differs from
  the one listeners heard last, compared at delivery, so a status a superseded change announced and
  the newer change announced again is heard once.
- **The relay relays a change whole.** A state change's transport events all go out, as a media
  element fires the events it queued before a listener's `pause()`; the listener's change follows
  them. Only a detachment (the player letting the session go) cuts the relay short.
- `SessionLifecycle` holds the session's state machine and its outbox; the player keeps its own
  outbox, which its parts (view, picture settings, sound, relay) emit through.

## Alternatives considered

- Keeping synchronous emission with its guards: correct and tested, but every transition needs a
  guard that nothing enforces, and the next one to be forgotten is a bug.
- Emitting on a microtask after every change: no guard needed, but events would arrive after the
  method returned, a `seek` would no longer be heard as `seeking` before the call returns to the
  caller, and every test and page listener would see a different order.
- Asserting that no listener calls back: pages and the element legitimately pause on `playing`
  and reload on `error`.

## Consequences

The re-checks after announcements are gone; a new transition is safe by construction as long as
it runs inside a change. Listeners hear a change's events after the change, with the state already
at its end: a listener of `seeking` reads the new time and may find the session already
`buffering`. Two seeks in a row announce `seeking` twice, as a media element does. The player's
async load still checks whether it is current after awaiting, as any superseded async work must.
