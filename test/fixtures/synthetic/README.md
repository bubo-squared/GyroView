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
