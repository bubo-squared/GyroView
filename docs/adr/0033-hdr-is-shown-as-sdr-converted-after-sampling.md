# ADR 0033: HDR is shown as SDR BT.709, converted in the shader right after a lens is sampled

Status: accepted (2026-09-30, revised 2026-10-01); the tone parameters are provisional, fitted
to one X6 recording

## Context

The X6 records 10-bit HEVC in HLG with BT.2020 primaries and matrix at limited range, the
colour in its SPS alone. The player drew every texel as the display's sRGB: mediabunny read the
colour, the adapter kept only the range, the lens textures asked for no colour conversion
(`NoColorSpace`), and the canvas is 8-bit SDR. An HLG picture shown that way looks flat, and
the gain matching (ADR 0012) worked on HLG-encoded values.

Who converts what had to be settled first. A browser uploading a `VideoFrame` to WebGL does
some of the work itself, and what it does was not documented for 10-bit HLG frames.

## Evidence

- **Frames built from planes** (`packages/adapters/three/src/videoFrameUpload.test.ts`):
  uniform 10-bit `I420P10` frames (Chromium) and 8-bit `I420` frames (Chromium, WebKit) of
  known codes, tagged BT.2020, HLG, limited, drawn as the raw lenses. The texels hold the codes
  through the BT.2020 matrix at full range, a colour chosen so that BT.2020, BT.709 and BT.601
  give it R′G′B′ at least eleven levels apart telling them apart; greys map linearly, as an SDR
  frame's would. No tone mapping.
- **Decoded frames** (`tools/integration/src/browser/decodedFrameUpload.test.ts`, the lossless
  fixture `hevc-main10-hlg-patches-64px-10fps.mp4` of four uniform patches): Chromium's decoded
  frames name the stream's colour, and their texels hold BT.2020's R′G′B′. WebKit's decoders
  convert through BT.709 whatever the stream says, the decoder configuration's colour space
  included, and name what they did on the frame: 8-bit `NV12` at full range, `bt709` primaries
  and matrix, `iec61966-2-1` transfer. Its greys are right, its colours off by up to eleven
  levels. Neither tone maps.
- **Insta360's own conversion**: the X6's Studio exports in HLG and in Rec.709 8-bit of the
  same stitch, compared pixel by pixel over three frames, give a fixed curve from HLG signal to
  SDR signal: scene light (BT.2100's inverse OETF, no OOTF), brightened by two fifths, its
  luminance rolled off above about 0.2 toward 1.5 with every channel scaled alike, and encoded
  with a power of 1/2.2. It reproduces Studio's SDR pixels to 1.9 levels of 255 per channel on
  average on a frame the fit did not see, with the same saturation; a roll-off of each channel
  apart leaves 4.1 levels and desaturates the highlights. BT.2408's display-referred conversion,
  which puts HLG's 75 % at SDR white, would draw the picture much brighter than Studio does.

## Decision

- **The boundary**: the upload (or a decoder that converts to RGB) derives R′G′B′ at full range
  through a matrix, which the frame names; the player brings them back to the track's own
  matrix where the two differ (`matrixCorrectionOf`, a 3x3 on the encoded texel), then converts
  the transfer and the primaries. `MatrixCorrections` in the three adapter follows the matrix
  each lens's frames name, so a correction costs a uniform write when it changes. The
  measurements that draw a recording in its own signal keep the correction (`asRecordedOf`), so
  WebKit's geometry is measured on the same texels as Chromium's.
- **The decoder is told the whole colour** the track names (`colorSpaceOf` in the WebCodecs
  adapter), not the range alone: WebCodecs gives the frames the configured colour space whole,
  so a partial one would unsay the bitstream on an engine that follows the specification.
- **A conversion per signal** (`domain/colour/DisplayConversion.ts`), data a shader evaluates,
  chosen through a table over every transfer, so a transfer the player learns to name does not
  compile until it is given one:
  - SDR transfers, or none named: `as-recorded`, exactly what the player always drew, for
    BT.709 or SD primaries; wider primaries are shown as BT.709 with a warning.
  - HLG: `hlg-to-sdr-bt709`, the inverse OETF per channel, a gamut matrix by the primaries
    (none for BT.709, BT.2087's at full precision for BT.2020 or primaries left unsaid, which
    BT.2100 means), and the tone curve (`ToneCurve`: exposure 1.4, luminance roll-off from 0.2
    toward 1.5, encoding power 2.2). HLG of other primaries is shown without a gamut change,
    with a warning.
  - PQ and linear light: drawn as recorded, with a `recording-degraded` warning, not refused.
    Tracks that share a warning share one.
- **In two stages, around the gain** (ADR 0012): `exposureSignalOf` brings a texel to where the
  lens's exposure is a factor (as recorded for SDR; for HLG, scene light in BT.709 raised to
  1/2.2), and `shownOf` brings a signal to the display (for HLG, exposed, rolled off, encoded).
  The seam meter measures exposure signals and the stitch scales them before showing, so two
  lenses a stop apart match in the shadows and the highlights alike, and a white still fits the
  meter's 8 bits. For the X5 both stages are the texel itself.
- **Chosen once, per frame source**, in the player's composition (`displayConversionsOf` beside
  the calibration), carried by `StitchingInputs`, required one per frame slot, and, per lens,
  `LensStitch.displayConversion`.
- **In the shader right after sampling** (`displayConversion.glsl`), linked by every program
  that reads a lens: the stitch, the seam meters and the lab through `sampleLensWith`, and the
  raw lenses, the view the player opens on (ADR 0022). The gamut, tone and matrix correction come
  as uniforms, BT.2100's constants and BT.709's luminance as float defines from the core.
- **RGBA8 textures stay**: the conversion reads the 8-bit code values the upload leaves.

## Alternatives considered

- Asking the browser to convert (`UNPACK_COLORSPACE_CONVERSION_WEBGL` on): its HDR-to-SDR
  mapping differs between browsers and cannot be tested in the core.
- An HDR canvas: browser support for HDR WebGL output is thin, and the player's picture is
  compared with SDR references everywhere.
- Converting after the stitch: gains and seam meters would compare HLG values; the raw lenses
  would stay unconverted.
- Gains after the conversion, on SDR values as for the X5: HLG's roll-off makes exposure no
  longer a factor there, so a gain fitted on the ring's mid-tones is wrong in its sky.
- Comparing the frame's colour with the track's once, at the decode probe, and warning: the
  matrix the frame names is what the correction needs, per frame source, at no cost.
- Half-float or `RGB10_A2` textures for the 10 bits: `RGB10_A2` keeps RGBA8's size and filters,
  so it would be the one to measure (whether browsers keep the GPU copy for it) if banding shows.

## Measured on the X6 (2026-10-01)

`tools/integration/src/measure/colourReference.test.ts`: the player's panorama of one X6
recording (ADR 0031) against the same moment of Studio's Rec.709 export, three frames, over the
whole sphere weighted by area (so without aligning them), Chromium and WebKit within half a
level of each other: the mean red, green and blue 1.6 to 4.5 levels brighter than Studio's, the
luma's 10th, 50th, 90th and 99th percentiles within 3 levels, the mean saturation 1.0 to 1.2
above Studio's. These statistics of a whole scene barely move under a wrong matrix, which the
upload tests guard instead. The residual
brightness is the player's own stitch of the raw lenses, not the curve, which matches Studio's
HLG master pixel for pixel. No banding shows in a 1536-pixel panorama's sky from the 8-bit
textures, so they stay; a view zoomed in may show it.

Two 3840-pixel 10-bit lens tracks at 50 fps decode at 123 pairs a second in Chromium and 98 in
WebKit on an M4 Pro (`localRecordings.test.ts`). That is the decoders alone, each frame closed
as it arrives: upload, mipmaps and drawing are not in it, nor 50 fps on a 60 Hz display.

## Consequences

- An X6 picture has Studio's colours to the fit's accuracy, in Chromium and in WebKit; the fit
  is from one recording.
- The X5 draws the same pixels: its lenses are shown as recorded, and its frames name the
  BT.709 matrix they carry.
- Filtering and mipmaps average HLG-encoded texels, before the conversion: fine high-contrast
  detail seen minified comes out a little darker than on an SDR camera. Converting each frame
  into a texture of its own before its mipmaps would fix it, if it is ever seen.
- WebKit's decoders hand 8-bit `NV12`, 22 MB at 3840 pixels as for the X5; Chromium's frames
  are opaque GPU frames (`format` null), 44 MB each if kept at 10 bits (P010). The frames the
  pipeline holds (its queue of four pairs, the pair on screen, the decodes under way) come to
  a quarter to half a gigabyte.
- WebKit clips its BT.709 R′G′B′ to the range before the correction, so the most saturated
  BT.2020 colours, which BT.709 cannot hold, come back a few levels off.
- Not yet checked, before calling the X6 supported on them: Chrome and Edge on Windows (ANGLE
  over Direct3D 11) with NVIDIA, Intel and AMD GPUs, Safari on macOS, Safari on iOS (memory),
  and presented rather than decoded frames at 8K50. A Dolby Vision recording whose sample entry
  is `dvh1` rather than `hvc1` is not read (verify on real file).
