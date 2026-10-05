# ADR 0042: The player keeps a media element's promises, about a seek, the end, the loop and play()

Status: accepted (2026-10-05)

## Context

The README says the transport events are "as a video's", and a page writes its own buttons, end
cards and snapshots against that. A review of the player against the media element found five
places where they were not:

- **A seek** went from `seeking` to `buffering` or `paused` in one change of the session, and the
  relay fired `seeked` with `seeking`, before any frame at the target had been decoded. A page
  that read the picture on `seeked` read the old one. The status went the same way: `seeking` was
  listed but could never be seen.
- **The end** fired `ended` without `pause`, so a page that drives its play button from `play`
  and `pause` kept showing Pause after the end.
- **The loop** was the player playing again after `ended`: every cycle fired `ended`, then
  `seeking`, `play`, `waiting` and `playing`, the status passing through `ended`, `paused` and
  `buffering`. Analytics counting `ended` or `play` counted each cycle; the spinner flashed at
  each.
- **`play()`** resolved without playing with no recording, when a newer `src` replaced the load
  it waited for, and when the element was out of the document; during a seek's buffering it
  resolved before the clock ran.
- **`load()`** resolved once ready, or, with `autoplay`, once playback had started, which can be
  seconds on a slow link.

## Decision

- **A seek is done once its first picture is drawn.** The session announces `seeked` then (or
  when its decode ended without a picture), says `isSeeking` until then, and the player's status
  reads `seeking` meanwhile. A playing seek resumes only after the picture: `seeking`, `waiting`,
  `seeked`, `playing`, the order a media element fires them in for a seek into data it does not
  hold yet. The picture is drawn as soon as it is decoded, not at the next animation frame,
  which a hidden tab or an offscreen frame never gets; the sound resumes there as before.
- **The end fires `timeupdate`, `pause`, `ended`**, in a media element's order.
- **The loop is the session's.** At the end a looping session seeks to the start and plays on:
  each cycle fires `seeking`, `seeked` and `timeupdate`, and `waiting` and `playing` around the
  few frames decoded again; never `ended`, `play` or `pause`. The spinner of a wait while playing
  or seeking shows only once the wait lasts, so the loop's does not flash.
- **`play()` resolves once playback runs** and rejects where a media element's promise does, with
  typed codes of the `usage` category: `no-source` with no recording, `play-interrupted` when a
  newer load or `unload` replaced the load it waited for or the element left the document first.
  Out of the document it waits for the connection and the load that starts. A `play()` while
  buffering after a seek or a starvation waits for the clock, as the first one does.
- **`load()` resolves once the recording is ready**; `autoplay` starts it then, a refusal a
  warning as before.

## Alternatives considered

- **The relay firing `seeked` on the next frame after a seek.** The player would hold the
  session's seeks in a second place; the session knows when its seek's picture is drawn, and
  only it can hold playback until then.
- **`seeking` as a state the session stays in until the picture.** A pause or a play during the
  seek would change nothing a listener hears until the seek ends, while a media element fires
  them at once; `seeking` beside the state, as a media element's `seeking` beside its `paused`,
  keeps both heard when they happen.
- **Drawing a seek's picture at the next tick.** In a hidden tab or a throttled offscreen iframe
  no tick comes, and a loop or a seek there would wait silent until the page was seen.
- **Rejecting with a `DOMException` named `AbortError` or `NotSupportedError`, as a video does.**
  Every failure of the player is a `GyroViewError` with a code a page can switch on; two shapes
  of rejection would make every page test for both.
- **A gapless loop, decoding the start before the end.** It would remove the `waiting` around the
  loop, at the cost of a second decode run held open; the spinner's delay hides the wait.

## Consequences

- A page's `seeked` arrives a decode later, with the picture there drawn; `statuschange` reports
  `seeking` until then.
- A looping recording no longer fires `ended`; a page that needs a cycle count listens for the
  `seeked` at zero.
- `play()` rejects in cases it resolved in: a page that calls it without a recording, or whose
  newer `src` interrupts it, sees `no-source` or `play-interrupted`, as it would see a video's
  rejection. A site that maps error codes to words learns two codes.
- `load()` with `autoplay` resolves before playback starts; a page that awaited it to read
  `paused` waits for `playing` instead.
