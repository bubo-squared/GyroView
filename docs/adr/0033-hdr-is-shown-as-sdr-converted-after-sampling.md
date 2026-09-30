# ADR 0033: HDR is shown as SDR BT.709, converted in the shader right after a lens is sampled

Status: accepted (2026-09-30); the tone parameters are provisional, fitted to one X6 recording

## Context

The X6 records 10-bit HEVC in HLG with BT.2020 primaries and matrix at limited range, the
colour in its SPS alone. The player drew every texel as the display's sRGB: mediabunny read the
colour, the adapter kept only the range, the lens textures asked for no colour conversion
(`NoColorSpace`), and the canvas is 8-bit SDR. An HLG picture shown that way looks flat, and
the gain matching (ADR 0012) worked on HLG-encoded values.

Who converts what had to be settled first. A browser uploading a `VideoFrame` to WebGL does
some of the work itself, and what it does was not documented for 10-bit HLG frames.

## Evidence

- **The upload** (`packages/adapters/three/src/videoFrameUpload.test.ts`): uniform 10-bit
  `I420P10` frames of known codes, tagged BT.2020, HLG, limited, drawn as the raw lenses. In
  Chromium the texels hold the codes through the BT.2020 matrix at full range: a saturated
  colour's green matches BT.2020's prediction (75) and not BT.709's (85); a grey ramp maps
  linearly, 300, 502 and 900 to 68, 127 and 243 of 255, as an SDR frame's would. No tone
  mapping. WebKit cannot build such frames from their planes; on the X6's own frame it draws what
  Chromium draws, within 0.22 levels on average, as on the X5 (0.2).
- **Insta360's own conversion**: the X6's Studio exports in HLG and in Rec.709 8-bit of the same
  stitch, compared pixel by pixel, give a fixed curve from HLG signal to SDR signal, the same on
  every frame: scene light (BT.2100's inverse OETF, no OOTF), brightened by about a quarter,
  rolled off above roughly 0.3 and encoded with a power near 1/2.2, fitting its luma to 0.01 RMS.
  BT.2408's display-referred conversion, which puts HLG's 75 % at SDR white, would draw the
  picture much brighter than Studio does.

## Decision

- **The boundary**: the upload applies the track's matrix and range; the player converts the
  transfer and the primaries. `TexelSignal` is what a lens texture holds: `{ primaries,
transfer }` of the track.
- **A strategy per signal** (`domain/colour/DisplayConversion.ts`): `AS_RECORDED` for every
  SDR or unspecified transfer, exactly what the player always drew; `HLG_TO_SDR_BT709`: the
  inverse OETF per channel, BT.2087's matrix into BT.709 at full precision so greys stay grey,
  and a tone curve (`ToneCurve`: exposure gain 1.25, roll-off from 0.3 toward 1.35, encoding
  power 2.2). A transfer none shows (PQ) is drawn as recorded with a `recording-degraded`
  warning, not refused. `toDisplay` is the reference, pure TypeScript.
- **Chosen once, per frame source**, in the player's composition (`displayConversionsOf` beside
  the calibration), carried by `StitchingInputs` and, per lens, `LensStitch.displayConversion`.
- **In the shader right after sampling** (`displayConversion.glsl`, `toDisplay(i, texel)`),
  linked by every program that reads a lens: the stitch, the seam meters and the lab through
  `sampleLensWith`, and the raw lenses, the view the player opens on (ADR 0022). Everything
  after it, gains, blend and seam measurements, works on SDR values as on the X5. The gamut and
  tone come as uniforms from the parameters, BT.2100's constants as defines from the core.
- **RGBA8 textures stay**: the conversion reads the 8-bit HLG code values the upload leaves.

## Alternatives considered

- Asking the browser to convert (`UNPACK_COLORSPACE_CONVERSION_WEBGL` on): its HDR-to-SDR
  mapping differs between browsers and cannot be tested in the core.
- An HDR canvas: browser support for HDR WebGL output is thin, and the player's picture is
  compared with SDR references everywhere.
- Converting after the stitch: gains and seam meters would compare HLG values; the raw lenses
  would stay unconverted.
- Half-float textures for the 10 bits: twice the memory and upload cost at 8K50; to be decided
  on visible banding.

## Measured on the X6 (2026-09-30)

The player's panorama of one X6 recording (ADR 0031) against the same moment of Studio's
Rec.709 export, over the whole sphere (so without aligning them): mean red, green and blue
within 2.2 levels of 255, the luma's 10th, 50th, 90th and 99th percentiles within 4 levels,
the mean saturation 25.5 against Studio's 27.6, alike in Chromium and WebKit. Drawn as recorded,
the same picture's mean was 30 levels brighter and its median luma 42. No banding shows in a
1536-pixel panorama's sky from the 8-bit textures, so they stay; a view zoomed in may show it.

Two 3840-pixel 10-bit lens tracks at 50 fps decode at 123 pairs a second in Chromium and 98 in
WebKit on an M4 Pro, twice what playback needs.

## Consequences

- An X6 picture has Studio's colours to the fit's accuracy, a touch less saturated; the fit is
  per luma, not per channel, from one recording.
- The X5 draws the same pixels: its lenses are shown as recorded.
- The decoder configuration still passes the range only; the upload shows the frames carry their
  colour space from the bitstream in both browsers.
