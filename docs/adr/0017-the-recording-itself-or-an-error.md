# ADR 0017: The recording itself or an error; the proxy never plays

Status: accepted (2026-09-26)

## Context

The camera writes a low-resolution proxy beside each recording (`LRV_..._01_...lrv`, a packed
dual fisheye at 1664x832 on the X5). ADRs 0002 and 0010 made it a fallback: with the `quality`
setting at `auto` (the default) the player looked for the proxy beside every URL with a `HEAD`
request and played it when this browser could not decode the recording; `quality="proxy"`
preferred it, `quality="full"` refused it, and the controls offered the choice whenever a proxy
was found. The player exists to show the recording as recorded: a viewer who gets the proxy
sees a picture at a fraction of the resolution, stitched from a packed frame, without asking
for it.

## Decision

The player plays exactly what it is given, at full resolution, and nothing in its place.

- **No quality setting.** The `quality` attribute, the menu choice and the embed parameter are
  gone.
- **No proxy.** The `proxy` attribute, the proxy file in `loadFiles`, the lookup beside a URL
  and the `isProxy` and `proxyName` metadata are gone. A recording this browser cannot decode
  is a `codec-unsupported` error with the probe's verdicts.
- **The packed layout stays.** A file whose one track holds both lenses is a format variant the
  core detects from the data; given as `src`, an LRV plays like any other recording.

## Alternatives considered

- Keeping the proxy as a silent fallback only: playback would still degrade without the viewer
  asking, and every load would still pay a `HEAD` request for a file most hosts never upload.
- Keeping the `quality` attribute for embedders with `full` as the default: a setting nobody
  asked for, whose only other values are the ones this decision rejects.

## Consequences

Loading is one path shorter and asks the server for nothing beside a recording that opens by
itself. On a machine without a decoder for the recording (8K HEVC without a Level 6 decoder)
the viewer sees the error instead of the proxy. The file-name convention still reads the proxy
digit, so tools can tell a proxy from a recording. Supersedes the proxy fallback in ADRs 0002
and 0010.
