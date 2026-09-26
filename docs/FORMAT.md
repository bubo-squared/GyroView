# Insta360 `.insv` format, as GyroView reads it

The single reference for byte layouts used in `packages/core/src/domain/format`. Every value was
verified on the two X5 recordings in `test/fixtures/x5/manifest.json` unless marked otherwise.
Sources for the unverified parts: Gyroflow `telemetry-parser` (`src/insta360/*`), ExifTool
`QuickTimeStream.pl`, `insta360-rs` docs, and Insta360's own manuals.

## Container

An ISO base media file: `ftyp`, `mdat`, `moov` (at the end, 4-5 MB) and then the Insta360
trailer. Newer firmware (X5 from at least v1.7) wraps the trailer in a top-level `inst` box;
older firmware appends it bare, so a top-level box walk ends in non-box bytes. `mdat` uses the
64-bit large-size header form. Lens images are separate square video tracks in one file on
X4/X5 (`hvc1`, 2880 or 3840 square, 8-bit full-range BT.709); X3 and older write one file per
lens (`_00_` back lens, `_10_` screen-side lens) at 5.7K and a single 2:1 packed frame below
that (unverified: no sample). The LRV proxy is a 1664x832 packed dual fisheye with the same
trailer.

## File names

`VID_20260814_132640_00_013.insv`: prefix, capture date and time, a two-digit stream code and a
sequence number. The first digit of the stream code names the lens (0 back, 1 screen side), the
second marks a proxy (0 the recording, 1 its low-resolution LRV, written as
`LRV_20260814_132640_01_013.lrv`). Split-file recordings pair `_00_` with `_10_`. Names are hints
for finding the other lens file and ordering inputs; everything they suggest is verified against the
file's contents (`RecordingFileName`, ADR 0004).

## Trailer

Read from the end of the file. All integers little-endian unless stated.

| Offset from EOF | Size     | Field                                             |
| --------------- | -------- | ------------------------------------------------- |
| -72             | 32       | reserved, zero                                    |
| -40             | u32      | trailer size: bytes from the payload start to EOF |
| -36             | u32      | version (3 on every documented camera)            |
| -32             | 32 ASCII | magic `8db42d694ccc418790edff439fe026bf`          |

`payload start = file size - trailer size`. Each record's payload is followed by a 6-byte header
`u8 format, u8 id, u32 size`. The header of the record nearest the footer sits at EOF-78.

- Indexed layout (X5): that record is the **index** (id 0, 310 bytes = 31 slots of 10 bytes:
  `u8 id, u8 format, u32 size, u32 offset from payload start`; slot k describes record type k;
  zero slots are empty). Most records sit at file offsets aligned to 128 KiB with zero padding
  between them (the info record and the small record 0x0a do not), so they cannot be walked
  contiguously.
- Contiguous layout (older firmware, unverified): no index; walk headers backwards from EOF-78
  until the payload start.

Record ids seen or documented: 1 info, 2 thumbnail, 3 gyro, 4 exposure, 5 thumbnail extended,
6 per-frame timestamps, 7 GPS, 0x09 0x0a 0x0b 0x0c 0x16 0x1b 0x1c 0x1d (X5, purpose unknown).

## Info record (id 1, format 1 = protobuf)

Field numbers (`packages/core/src/domain/format/info/infoFields.ts`): 1 serial, 2 model,
3 firmware, 5 `offset` (v1 calibration), 19 dimension {1 width, 2 height}, 20 frame rate,
22 capture mode, 24 `first_frame_timestamp` (capture clock), 25 rolling shutter (ms, double),
26 file group {1 type, 2 index, 3 identify, 4 total}, 27 window crop {1..6}, 28 gyro offset
(ms, double), 29 has gyro offset, 40 total frames, 42 flowstate online, 51 gyro type,
53 `offset_v2`, 54 `offset_v3`, 62 raw gyro flag, 64 pts type (1 track timestamps, 2 exposure
record), 65 gyro config {1 accelerometer range g, 2 gyroscope range dps}, 79 file layout
(1 split files, 2 multi-track; provisional), 80 track order (provisional). The window crop
(27: 1 sensor width, 2 sensor height, 3 crop width, 4 crop height, 5 offset x, 6 offset y;
5376, 5376, 5312, 5312, 0, 0 on the X5) is parsed and reported but not applied to the
canvas-to-frame mapping: the frames show the whole calibration square (ADR 0014).

## Gyro record (id 3)

- Raw layout (`is_raw_gyro` = 1, X5): 20-byte samples `u64 timestamp us, u16 ax ay az,
u16 gx gy gz`; components are offset-binary around 32768 and scale by
  `range / 32768` (accelerometer in g, gyroscope in degrees per second, converted to rad/s).
  1 kHz on X5; gravity magnitude reads 1.008 g with the 32 g range.
- Float layout (older cameras, unverified): 56-byte samples `u64 timestamp ms, 3 x f64 accel g,
3 x f64 gyro rad/s`.

## Exposure record (id 4)

16-byte entries `u64 capture timestamp us, f64 exposure s`, one per captured frame. Entries
begin a few frames before `first_frame_timestamp` (six on the office file) and end a few after
the last encoded frame. Frame k of the video is entry `indexAtOrAfter(first_frame_timestamp) + k`.

## Capture clock

Gyro samples, exposure entries and `first_frame_timestamp` share one microsecond clock.
`video time = (timestamp - first_frame_timestamp) / 1e6`; gyro readings are additionally shifted
by the info record's gyro offset (1.6 ms on X5). Stabilization samples the orientation at
`video time + exposure / 2 + rolling shutter / 2`.

## Calibration strings

Underscore-separated numbers; token 0 is the lens count; the last token is a version word
(v1: lens type in the low 10 bits, upper bits that differ between cameras and carry no version;
v2/v3: version 2 or 3 in the high 16 bits). The lens type is not used.

| Version        | Tokens per lens | Per-lens fields                                                              | Model                                                                        |
| -------------- | --------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| v1 `offset`    | 6               | r cx cy yaw pitch roll (+ canvas width, height after the lenses)             | equidistant, r = radius at the 100-degree field edge                         |
| v2 `offset_v2` | 16              | r cx cy yaw pitch roll tx ty tz c1 c2 c3 c4 width height type                | polynomial in radians scaled so 100 degrees maps to r (hypothesis, ADR 0005) |
| v3 `offset_v3` | 19              | xi fx fy cx cy yaw pitch roll tx ty tz k1 k2 k3 p1 p2 width height type      | unified (Mei) with radial-tangential distortion                              |
| v6             | 27              | xi fx fy cx cy yaw pitch roll tx ty tz + 13 coefficients + width height type | not supported yet                                                            |

Angles in degrees, translations in metres relative to lens 0, pixel values on a canvas of
lens-count squares side by side (10752 x 5376 on X5; lens 1 `cx` is offset by 5376).
