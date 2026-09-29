# Synthetic media fixtures

`dual-track-64px-10fps-3s.mp4`: two 64x64 H.264 video tracks (ffmpeg `testsrc` and `testsrc2`
patterns), 10 fps, 3 s, a key frame every 10 frames, no B-frames, `avc1` sample entries,
`moov` before `mdat`. Generated with ffmpeg 9 for demuxer and decoder tests that must run in CI
without the real recordings. Regenerate with:

```sh
ffmpeg -f lavfi -i "testsrc=size=64x64:rate=10" -f lavfi -i "testsrc2=size=64x64:rate=10" -t 3 \
  -map 0:v -map 1:v -c:v libx264 -preset ultrafast -g 10 -bf 0 -pix_fmt yuv420p -tag:v avc1 \
  -movflags +faststart test/fixtures/synthetic/dual-track-64px-10fps-3s.mp4
```

`dual-track-aac-64px-10fps-3s.mp4`: the same two video tracks plus a stereo AAC-LC track (a
440 Hz sine at 48 kHz, 64 kb/s), for the audio track reader, the fragmented-MP4 segmenter and
the audio clock tests. Regenerate with:

```sh
ffmpeg -f lavfi -i "testsrc=size=64x64:rate=10" -f lavfi -i "testsrc2=size=64x64:rate=10" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 3 -map 0:v -map 1:v -map 2:a \
  -c:v libx264 -preset ultrafast -g 10 -bf 0 -pix_fmt yuv420p -tag:v avc1 \
  -c:a aac -b:a 64k -ac 2 -movflags +faststart \
  test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4
```

`x5-trailer-dual-track-64px-10fps-3s.mp4` and `x5-trailer-dual-track-aac-64px-10fps-3s.mp4`:
the two files above followed by an `inst`-wrapped, indexed Insta360 trailer assembled from the
office X5 byte slices in `test/fixtures/x5/office` (the info record with its calibration, the
first 2000 gyro samples, the first 16 exposure entries). They are what the player opens in its
browser tests: layout detection sees two square tracks, frame times fall back to the track
timestamps because the exposure record is shorter than the video, and the gyro covers the first
two seconds. Regenerate with `pnpm fixtures:build` (`tools/fixtures`).

`late-start-64px-10fps-3s.mp4`: one 64x64 H.264 track like those of
`dual-track-64px-10fps-3s.mp4`, whose edit list starts it at 0.7 s, for the track reader contract on a track that does not start at zero. No real
recording is known to start later; verify on real file. Regenerate with:

```sh
ffmpeg -f lavfi -i "testsrc=size=64x64:rate=10" -t 3 -c:v libx264 -preset ultrafast -g 10 -bf 0 \
  -pix_fmt yuv420p -tag:v avc1 -output_ts_offset 0.7 -movflags +faststart \
  test/fixtures/synthetic/late-start-64px-10fps-3s.mp4
```

`dual-track-aac-moov-at-end-64px-10fps-3s.mp4`: `dual-track-aac-64px-10fps-3s.mp4` without
`+faststart`, so the movie box comes after the media data, as the cameras write it. Its sound
track groups its samples in chunks of changing size (20 sample-to-chunk entries) and its edit
list skips the encoder's priming (media time 1024). For the sample table's agreement with
mediabunny. Regenerate with:

```sh
ffmpeg -f lavfi -i "testsrc=size=64x64:rate=10" -f lavfi -i "testsrc2=size=64x64:rate=10" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 3 -map 0:v -map 1:v -map 2:a \
  -c:v libx264 -preset ultrafast -g 10 -bf 0 -pix_fmt yuv420p -tag:v avc1 \
  -c:a aac -b:a 64k -ac 2 test/fixtures/synthetic/dual-track-aac-moov-at-end-64px-10fps-3s.mp4
```

`hevc-b-frames-dual-track-64px-10fps-3s.mp4`: two 64x64 HEVC tracks (`hvc1`) with B-frames, a
key frame every 10 frames: its composition offsets reorder the frames (30 runs) and its edit
list starts the media at 2048 ticks. The cameras record without B-frames; the agreement with
mediabunny covers the reordering anyway. Regenerate with:

```sh
ffmpeg -f lavfi -i "testsrc=size=64x64:rate=10" -f lavfi -i "testsrc2=size=64x64:rate=10" -t 3 \
  -map 0:v -map 1:v -c:v libx265 -preset ultrafast \
  -x265-params "keyint=10:min-keyint=10:bframes=2:log-level=error" -pix_fmt yuv420p -tag:v hvc1 \
  test/fixtures/synthetic/hevc-b-frames-dual-track-64px-10fps-3s.mp4
```
