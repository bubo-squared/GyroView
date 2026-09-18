# Phase 0 spike (throwaway)

Feasibility check for decoding raw Insta360 `.insv` files in the browser. Nothing in this
folder is production code: it exists to answer questions, and every idea that survives is
rewritten test-first inside `packages/`.

## Questions and answers (Apple M4 Pro, macOS 26.6, 2026-09-18)

| Question                                                                    | Chrome 153                                                                                          | WebKit 26.6 (Playwright build of Safari's engine) |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Does mediabunny open the file with the `inst` trailer box over HTTP ranges? | yes: MP4, 2 video + 1 audio track, correct duration                                                 | yes                                               |
| Decoder config reported                                                     | `hev1.1.6.H153.80` (5.7K60) / `hev1.1.6.L183.80` (8K30), hvcC description present, full-range bt709 | same                                              |
| `VideoDecoder.isConfigSupported`, prefer-hardware                           | true                                                                                                | true                                              |
| `MediaCapabilities.decodingInfo`                                            | supported, smooth, power efficient                                                                  | **unsupported** (false negative; decoding works)  |
| Dual-track 5.7K60 lockstep decode, 10 s of media                            | 600 pairs in 3.47 s = **173 pairs/s**, 0 unpaired                                                   | 600 pairs in 3.39 s = **177 pairs/s**, 0 unpaired |
| Dual-track 8K30 lockstep decode, 10 s of media                              | 300 pairs in 2.99 s = **100 pairs/s**, 0 unpaired                                                   | 300 pairs in 2.91 s = **103 pairs/s**, 0 unpaired |
| First frame pair latency                                                    | 85 ms / 106 ms                                                                                      | 49 ms / 62 ms                                     |
| `texImage2D(VideoFrame)` CPU cost per pair (2 textures)                     | 0.14 ms avg, 0.6 ms max                                                                             | 0.9-1.3 ms avg, 82 ms max (first upload)          |
| `MAX_TEXTURE_SIZE`                                                          | 16384                                                                                               | 16384                                             |
| Seek to t=100 s (keyframe at 98.098 s)                                      | 372 ms (115 frames discarded) / 330 ms (58 frames)                                                  | 360 ms / 321 ms                                   |
| Plain `<video src=file.insv>` plays?                                        | yes, metadata + playback advance                                                                    | yes                                               |
| Sustained: 60 s of 5.7K60 media, dual-track                                 | 3597 pairs in 19.9 s = **180 pairs/s**, 0 unpaired, 0.11 ms avg upload                              | not run                                           |

Exit criteria from the plan (5.7K60 >= 50 pairs/s, 8K30 >= 25 pairs/s on the Mac) are met about
three times over. Both tracks carry identical timestamps, so pairing by timestamp needs no tolerance logic.

Consequences for the design:

- WebCodecs + mediabunny + WebGL2 is confirmed as the pipeline; no truncated-source fallback is needed for the `inst` box.
- `MediaCapabilities` cannot be the gate on WebKit; the probe decode of a real keyframe is the authoritative check.
- A plain `<video>` element accepts the raw file, which gives a cheap fallback path for single-track layouts and confirms the trailer is harmless to browsers.
- Seeking costs one GOP of decode (about 0.35 s worst case); scrub mode should show the keyframe first.

Raw results: `results/*.json`. iPhone numbers are still missing (see below).

## Running

```sh
pnpm install
cd spike
node measure.mjs                 # Chrome (installed) + WebKit, both samples, 10 s each; JSON on stdout
SECONDS=60 ENGINES=chrome FILES=office/VID_20260814_132640_00_013.insv node measure.mjs
```

Interactive: `pnpm serve-samples` (port 8787) and `pnpm dev` (port 5173), then open
`http://localhost:5173/?src=http://localhost:8787/office/VID_20260814_132640_00_013.insv&seconds=10`.

### iPhone (Safari)

1. Start both servers with LAN binding: `pnpm serve-samples` and `pnpm exec vite --host --port 5173`.
2. On the phone (same Wi-Fi), open `http://<mac-ip>:5173/?src=http://<mac-ip>:8787/office/VID_20260814_132640_00_013.insv&seconds=10`.
3. Read the log on the page; repeat with the `sailing` file for 8K30. Record the `lockstep decode`
   and `support track` lines in `results/`.
