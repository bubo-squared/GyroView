# Feasibility measurements

Before any production code was written, a throwaway spike answered whether raw Insta360 files
can be decoded and drawn in a browser at all. The spike has since been removed; these are its
findings, kept because the design rests on them. Measured on an Apple M4 Pro, macOS 26.6, on
2026-09-18, with the two X5 sample recordings (5.7K60 and 8K30, HEVC, two tracks each).

| Question                                                                    | Chrome 153                                                                               | WebKit 26.6 (Playwright build of Safari's engine)   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Does mediabunny open the file with the `inst` trailer box over HTTP ranges? | yes: MP4, 2 video + 1 audio track, correct duration                                      | yes                                                 |
| Decoder configuration reported                                              | `hev1.1.6.H153.80` (5.7K60), `hev1.1.6.L183.80` (8K30), `hvcC` present, full-range bt709 | same                                                |
| `VideoDecoder.isConfigSupported`, prefer-hardware                           | true                                                                                     | true                                                |
| `MediaCapabilities.decodingInfo`                                            | supported, smooth, power efficient                                                       | unsupported (a false negative; decoding works)      |
| Dual-track 5.7K60 lockstep decode, 10 s of media                            | 600 pairs in 3.47 s = 173 pairs/s, 0 unpaired                                            | 600 pairs in 3.39 s = 177 pairs/s, 0 unpaired       |
| Dual-track 8K30 lockstep decode, 10 s of media                              | 300 pairs in 2.99 s = 100 pairs/s, 0 unpaired                                            | 300 pairs in 2.91 s = 103 pairs/s, 0 unpaired       |
| First frame pair latency                                                    | 85 ms / 106 ms                                                                           | 49 ms / 62 ms                                       |
| `texImage2D(VideoFrame)` CPU cost per pair (2 textures)                     | 0.14 ms average, 0.6 ms maximum                                                          | 0.9 to 1.3 ms average, 82 ms maximum (first upload) |
| `MAX_TEXTURE_SIZE`                                                          | 16384                                                                                    | 16384                                               |
| Seek to t = 100 s (key frame at 98.098 s)                                   | 372 ms (115 frames discarded) / 330 ms (58 frames)                                       | 360 ms / 321 ms                                     |
| Plain `<video src="file.insv">` plays?                                      | yes, metadata and playback advance                                                       | yes                                                 |
| Sustained: 60 s of 5.7K60 media, dual-track                                 | 3597 pairs in 19.9 s = 180 pairs/s, 0 unpaired                                           | not run                                             |

The exit criteria (5.7K60 at 50 pairs/s or better, 8K30 at 25 pairs/s or better on the Mac)
were met about three times over. Both tracks carry identical timestamps, so pairing by
timestamp needs no tolerance logic.

Consequences for the design:

- WebCodecs, mediabunny and WebGL2 form the pipeline (ADR 0002, ADR 0003); no truncated-source
  fallback is needed for the `inst` box.
- `MediaCapabilities` cannot be the gate on WebKit; the probe decode of a real key frame is the
  authoritative check (`probeDecoding`).
- A plain `<video>` element accepts the raw file, which confirms the trailer is harmless to
  browsers.
- A seek costs one group of pictures of decoding (about 0.35 s worst case), so the seek bar
  shows the key frame first while dragged (`scrub`).

Still unmeasured: an iPhone. The developer page (`pnpm --filter @gyroview/embed dev`, served
with `--host` on the same network) is the way to run the recordings on one.
