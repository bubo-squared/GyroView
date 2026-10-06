# ADR 0030: Errors say whose side they are on; a browser without WebCodecs has its own code

Status: accepted (2026-09-30)

## Context

A page that embeds the player decides what to do when a recording cannot play: show why, offer
the file for download, or fall back to the browser's own `<video>`. It had only the `code` to go
on, one of 28, half of them from the parsers beneath the format (`binary-out-of-bounds`,
`invalid-protobuf`) and not listed in the deployment guide. To tell a browser's failure from a
file's or a server's, a page had to list codes and keep up with new ones.

balmora fell back to a `<video>` on every failure. On Ubuntu with an NVIDIA driver, Chrome
decodes no HEVC: GyroView refused the X5 recording as `codec-unsupported` 35 ms after the load
began, having read 5 MB, and the `<video>` then played the sound under a black picture,
streaming the interleaved recording, without an `error` event. Nothing told the page that its
fallback could not help.

A browser without WebCodecs was reported as `codec-unsupported` too, with a message blaming the
codec: the WebCodecs port answered "not supported" for any configuration. That is the one browser
failure where a `<video>` may still play the recording (a page served over plain HTTP, an old
browser), so a page could not choose right from the code.

## Decision

- **Every `GyroViewError` carries a `category`**, derived from its code through one record in
  core (`shared/errors`), so a new code cannot be added without one:
  - `browser`: this browser cannot decode or draw the recording (`codec-unsupported`,
    `webcodecs-unavailable`, `render-unavailable`, `decode`, `playback-blocked`);
  - `recording`: the file is not one the player can play, damaged, cut short, or without its
    calibration or its second file, including every parser code;
  - `source`: its bytes could not be read as the player reads them (`cors`,
    `range-unsupported`, `source-unreadable`, `source-changed`, `source-truncated`);
  - `usage`: the page misused the API (`invalid-argument`, `embed-destroyed`);
  - `internal`: a failure the player did not expect (`invariant-violation`,
    `index-out-of-range`).

  It is the error's own property, set in the constructor, not a getter: a serialized or logged
  copy keeps it, and the iframe handle, which rebuilds errors from their code, gets it without a
  change to the embed protocol.

- **`webcodecs-unavailable`** is the code of a browser without WebCodecs. The WebCodecs port
  rejects `isSupported` and `create` with it, whatever the configuration, and the decode probe
  passes that rejection on as it does a track it cannot read. Its message names a page that is
  not a secure context when that is the cause.
- **The player falls back to nothing.** What a page does with a failure stays the page's: the
  README says, by code, where a `<video>` fallback can help and where it only plays the sound.

## Alternatives considered

- Documenting the codes by group and adding nothing to the error: every page would carry its
  own copy of the grouping, stale as soon as a code is added.
- A `canFallBack` flag, or a list of the codes a `<video>` can play: advice about a player
  GyroView does not run, which it cannot verify on the page's browser.
- A player that falls back to a `<video>` itself: it would show one lens unstitched, still no
  picture for `codec-unsupported`, and hide the failure the page needs to hear (ADR 0017).
- Codec and frame size as fields of `codec-unsupported`: useful for a precise hint, but the
  message already names them, and fields can be added later without breaking a page.

## Consequences

A page handles failures by category and reads the code only where it needs the detail. A page on
plain HTTP now hears `webcodecs-unavailable` where it heard `codec-unsupported`; the change is
listed in the changelog. The categories are part of the public API: moving a code to another
category is a breaking change.

## Since the review of 2026-10-05

- The iframe handle now rebuilds the `error` event's error from its code, as it did a rejected
  command's: the event reached the page as a plain code and message, without the category this
  ADR says the handle gets.
- `embed-unreachable` (`usage`) fails the iframe handle's commands when the frame loads and never
  says hello: a wrong `embedPageUrl`, a host that refuses to be framed, a page without an origin.
  They waited forever. It is the page's setup, not the browser's or the recording's.
