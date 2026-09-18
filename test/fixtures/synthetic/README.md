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
