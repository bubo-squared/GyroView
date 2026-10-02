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
X4/X5 (`hvc1`, 2880 or 3840 square, 8-bit full-range BT.709) and on the X6 (`hvc1`, 3840 square,
HEVC Main 10, limited-range BT.2020 with HLG, the colour in the SPS alone without a `colr` box;
50 fps at 8K) and on the Antigravity A1 (`hvc1`, 3840 square, 8-bit full-range BT.709, no sound
track, the `hvcC` header blank); X3 and older write one file per lens (`_00_` back lens, `_10_` screen-side lens)
at 5.7K and a single 2:1 packed frame below that (unverified: no sample). The LRV proxy is a
1664x832 packed dual fisheye with the same trailer (2048x1024 8-bit HLG on the X6).

## Movie box

The core reads the movie box itself into a sample table (`format/mp4`, ADR 0029), by ISO/IEC
14496-12. What it reads, box by box:

- `mvhd`: the movie timescale, for edit lists. `mvex` marks a fragmented file, which is refused
  (`unsupported-container`); no camera writes one.
- `trak/tkhd`: the track id, which joins the track to its codec. `mdia/mdhd`: the media
  timescale. `mdia/hdlr`: `vide` or `soun`; tracks of any other handler (the cameras' own
  metadata tracks) are left out.
- `stbl/stsd`: the sample entry type, and for AVC and HEVC the NAL length size from `avcC`
  (byte 4) or `hvcC` (byte 21), low two bits plus one.
- `hvcC`, for the codec string: the profile, tier and level in bytes 1 to 12, or, where they name
  profile 0 (the Antigravity A1 leaves them blank), those of the first SPS the box carries
  (ADR 0037).
- `stts` durations, `ctts` composition offsets (read signed in both versions, as mediabunny
  does), `stss` sync samples (none listed: every sample is one), `stsz` sizes, `stsc` samples a
  chunk, `stco` or `co64` chunk offsets.
- `edts/elst`: the first edit that shows media, at rate 1 (16.16 fixed point); an empty edit
  before it delays the track by its length in the movie timescale.

Timing matches mediabunny's to the sample: a sample's time is its presentation time less the
edit's shift, divided once by the timescale; with composition offsets a sample lasts until the
next one shows, the last shown keeping its own duration. A listed sync sample of AVC or HEVC is
checked against its first slice before decoding starts there (an IDR for AVC, type 5; an IRAP
for HEVC, types 16 to 23: ITU-T H.264 and H.265 Table 7-1); one that is none is passed over.

Seen on every sample: the movie box at the end, beside the trailer; no fragments; one sample
a chunk, the tracks' samples alternating in file order (a lens frame, the other lens's, and
sound between); `co64` on large files and on the X3; one `ctts` entry on HEVC; an empty edit
at the start of the X3's sound.

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

- Indexed layout (X5, X6): that record is the **index** (id 0, 310 bytes = 31 slots of 10
  bytes on the X5, 59 slots on the X6: `u8 id, u8 format, u32 size, u32 offset from payload
start`; slot k describes record type k, so the index holds as many slots as its highest id
  needs; zero slots are empty). Most records sit at file offsets aligned to 128 KiB with zero padding
  between them (the info record and the small record 0x0a do not), so they cannot be walked
  contiguously.
- Contiguous layout (older firmware, unverified): no index; walk headers backwards from EOF-78
  until the payload start.

Record ids seen or documented: 1 info, 2 thumbnail, 3 gyro, 4 exposure, 5 thumbnail extended,
6 per-frame timestamps, 7 GPS, 0x09 0x0a 0x0b 0x0c 0x16 0x1b 0x1c 0x1d (X5, purpose unknown),
0x34 and 0x36 (X6: 16-byte entries `u64 capture timestamp µs, f64 exposure s` at 25 Hz, likely
the LRV proxy's per lens; not read).

## Info record (id 1, format 1 = protobuf)

Field numbers (`packages/core/src/domain/format/info/infoFields.ts`): 1 serial, 2 model,
3 firmware, 5 `offset` (v1 calibration), 19 dimension {1 width, 2 height}, 20 frame rate,
22 capture mode, 24 `first_frame_timestamp` (capture clock), 25 rolling shutter (ms, double),
26 file group {1 type, 2 index, 3 identify, 4 total}, 27 window crop {1..6}, 28 gyro offset
(ms, double), 29 has gyro offset, 40 total frames, 42 flowstate online, 51 gyro type,
53 `offset_v2`, 54 `offset_v3`, 62 raw gyro flag, 64 pts type (1 track timestamps, 2 exposure
record), 65 gyro config {1 accelerometer range g, 2 gyroscope range dps}, 79 file layout
(1 split files, 2 multi-track; provisional), 80 track order (provisional), 111 `offset_v6`
(v6 calibration, 27 tokens a lens). The window crop
(27: 1 sensor width, 2 sensor height, 3 crop width, 4 crop height, 5 offset x, 6 offset y;
5376, 5376, 5312, 5312, 0, 0 on the X5; 7744, 7744, 7680, 7680, 0, 0 on the X6) is parsed and reported but not applied to the
canvas-to-frame mapping: the frames show the whole calibration square (ADR 0014).

Each calibration string has an "original" copy beside it, the factory calibration where the
string itself may already account for an accessory (insta360-rs): 17 for `offset`, 55 for
`offset_v2`, 56 for `offset_v3`, 112 for `offset_v6`. On every recording seen the copies equal
the strings, so the player does not read them. The X5 writes all four strings; the X6 writes
only `offset_v6` and its copy. Neither writes field 136, which insta360-rs reads as the
calibration generation: the version word of each string tells it.

## Gyro record (id 3)

- Raw layout (`is_raw_gyro` = 1, X5): 20-byte samples `u64 timestamp us, u16 ax ay az,
u16 gx gy gz`; components are offset-binary around 32768 and scale by
  `range / 32768` (accelerometer in g, gyroscope in degrees per second, converted to rad/s).
  1 kHz on X5; gravity magnitude reads 1.008 g with the 32 g range.
- Float layout (older cameras, unverified): 56-byte samples `u64 timestamp ms, 3 x f64 accel g,
3 x f64 gyro rad/s`.

## Exposure record (id 4)

16-byte entries `u64 capture timestamp, f64 exposure s`, one per captured frame, the timestamp
in the gyro layout's unit (microseconds raw, milliseconds float). Entries
begin a few frames before `first_frame_timestamp` (six on the office file) and end a few after
the last encoded frame. Frame k of the video is entry `indexAtOrAfter(first_frame_timestamp) + k`.

## Capture clock

Gyro samples, exposure entries and `first_frame_timestamp` share one clock, stamped in the gyro
layout's unit: microseconds on raw-layout cameras, milliseconds on float-layout ones (as
telemetry-parser reads them; verify on a float-layout file).
`video time = first frame's track time + (timestamp - first_frame_timestamp) / 1e6`, the first
frame's track time being zero unless an edit list starts the track later; gyro readings are
additionally shifted by the info record's gyro offset (field 28, 1.6 ms on X5), which applies
only where field 29 says the camera measured one. Stabilization samples the orientation at
`video time + exposure / 2`: an exposure entry's timestamp is its frame's middle row's (ADR 0034).

## Calibration strings

Underscore-separated numbers; token 0 is the lens count; the last token is a version word
(v1: lens type in the low 10 bits, upper bits that differ between cameras and carry no version;
v2/v3/v6: version 2, 3 or 6 in the high 16 bits, `0x0400` in the low bits on every word seen).
The lens type is not used.

| Version        | Tokens per lens | Per-lens fields                                                                                 | Model                                                                                               |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| v1 `offset`    | 6               | r cx cy yaw pitch roll (+ canvas width, height after the lenses)                                | equidistant, r = radius 96 degrees from the axis (ADR 0023); read first                             |
| v2 `offset_v2` | 16              | r cx cy yaw pitch roll tx ty tz c1 c2 c3 c4 width height type                                   | polynomial in radians scaled so 100 degrees maps to r (hypothesis, ADR 0005)                        |
| v3 `offset_v3` | 19              | xi fx fy cx cy yaw pitch roll tx ty tz k1 k2 k3 p1 p2 width height type                         | unified (Mei) with radial-tangential distortion                                                     |
| v6 `offset_v6` | 27              | xi fx fy cx cy yaw pitch roll tx ty tz k1 k2 k3 k4 k5 p1 p2 p3 p4 s1 s2 s3 s4 width height type | unified (Mei), drawn with k1..k5 and p1 p2; p3 p4 s1..s4 carried, not drawn (ADR 0032, provisional) |

Angles in degrees, translations in metres relative to lens 0, pixel values on a canvas of
lens-count squares side by side (10752 x 5376 on X5, 15488 x 7744 on the X6; lens 1 `cx` is
offset by one square).
