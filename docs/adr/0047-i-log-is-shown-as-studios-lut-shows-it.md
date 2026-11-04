# ADR 0047: I-Log is shown as Insta360 Studio's I-Log LUT shows it

Status: accepted (2026-11-04), provisional: the LUT fitted to one X6 recording of one scene; I-Log
of every other camera is drawn as recorded until its LUT is fitted

## Context

The X6 records I-Log, Insta360's log mode, as 10-bit HEVC whose SPS names the colour its standard
mode does: BT.709 primaries, transfer and matrix, at limited range. Insta360 specifies I-Log in
BT.2020 (the X6 manual's colour spaces). The player picked a conversion by the bitstream's colour
alone (ADR 0033), so it drew I-Log as recorded: a log signal gathers in the middle of the range,
its blacks grey and its whites dim, and BT.2020's colours read as BT.709 come out pale. On one
recording, I-Log's luma spans just over half the range standard mode's does, at a third of its
saturation. Only the info record tells the two apart: its capture mode reads `I_Log` where standard
mode's reads `standard`. Insta360 publishes no I-Log curve, only LUTs, which Studio applies on
request.

## Evidence

- **Studio's LUT**: Studio's exports of one X6 I-Log recording (ADR 0031), the same stitch plain
  and with the LUT, compared pixel by pixel at 1920 by 960 over five frames, each fit scored on the
  frame it left out:
  - The LUT keeps greys grey, and a table of 17 by 17 by 17 colours reproduces it to 1.8 levels of
    255 on average: it is one mapping of colour, whatever the picture shows. Studio's Color Plus is
    not: no such table brings it within 3.1 levels of the 5.5 it moves the picture.
  - A curve from the signal to scene light, the same for each channel, then BT.2087's matrix from
    BT.2020 into BT.709, then Studio's tone curve of ADR 0033 at an exposure of its own: 3.2 levels
    on average, 7.8 at the 95th percentile, at 17 points (3.3 at 9, 3.2 at 13). Without a matrix,
    red is 9.5 levels off: I-Log is wider than BT.709, as Insta360 says. But the sky, nearly half
    the pixels, comes out some 4 levels too green: the published matrix does not take blue as
    the LUT does.
  - The matrix fitted with the curve, its rows summing to one, the tone curve still Studio's: 2.7
    levels, the sky's green under 1.5. The fitted matrix stays near BT.2087's, a little more apart
    in green and a little less in blue.
  - The tone fitted too: 2.3 levels, its knee gone to nothing and its power to near one, a curve
    that no longer reads as a display's. A pure log curve, four parameters, through BT.2087's
    matrix and the tone: 4.8.
- **Studio's plain export is the signal as recorded**: the player's panorama of the recording
  drawn as recorded, against Studio's plain export at three moments, the whole sphere's statistics
  weighted by area as ADR 0033 compares them: the mean red, green and blue 1.2 to 3.1 levels
  brighter than Studio's, the saturation within 0.4, in Chromium and WebKit. The LUT fitted to
  Studio's exports is the LUT of the player's texels.
- **The matrix the SPS names**: BT.709's, and the picture is taken as encoded through it. Read
  through BT.2020's instead, the converted picture would move 0.4 levels on average, 1.5 at the
  99th percentile: under what a whole scene's statistics tell apart, and not measured.
- **The player's conversion** (`measure/colourReference.test.ts`), its panorama against Studio's
  LUT export at three moments: the mean red, green and blue within 3.5 levels, the saturation
  within 1.3, the luma's 10th, 50th, 90th and 99th percentiles within 3.1 in Chromium and 3.7 in
  WebKit. WebKit draws the X6's 10-bit SDR some 1.4 levels redder and bluer than Chromium already
  as recorded, standard mode's too, and the I-Log curve steepens it. No banding shows in the sky of
  a 1536-pixel panorama from the 8-bit textures. ADR 0033's HLG measurement holds unchanged.
- **The reference, seen**: a screenshot of the player in Chrome and Safari beside Studio's LUT
  export in QuickTime. QuickTime shows the export lighter: its pixels on screen are the export's
  read with a gamma of 1.961, 2.2 levels apart, where a browser's reading of a page's colours
  would leave 8.6. The player is held to the export as a browser shows a page, which is how both
  browsers show its canvas.

## Decision

- **The log encoding** (`logEncodingOf`, `domain/colour/LogEncoding.ts`): a recording whose info
  record's capture mode is `I_Log` is I-Log, whatever its bitstream says, shown by Studio's LUT as
  fitted for its camera (`FittedLut`), chosen by the whole model name, as the IMU frames are. Only
  the X6's is fitted; another camera that writes `I_Log` is drawn as recorded, with a warning, and
  one that names its log mode otherwise is drawn as recorded without one.
- **The fitted LUT**: the encoding's curve to scene light (`LogCurve`), log2 of the light at the
  signal's sixteenths, the light growing by a constant factor along each, white's light one as
  HLG's is, so that an exposure signal still fits the seam meter's 8 bits; the matrix that takes
  the light into BT.709; and the exposure, 3.625, that brings the light up before Studio's tone
  curve, as that curve's own 1.4 brings HLG's. The signal was seen from 0.14 to 0.82: the last
  three points carry on the slope fitted at its top, on the few highlights the scene held, though
  the slopes below fall steadily, and from about 0.9 the tone curve draws white. How Studio draws
  a brighter highlight is not measured.
- **The conversion** (`log-to-sdr-bt709`): `displayConversionsOf` takes the recording's log
  encoding beside the tracks' colours, and gives a track the bitstream names SDR the LUT's curve,
  its matrix as the gamut, and Studio's tone curve at its exposure. A track the bitstream names HLG
  stays HLG. In the shader the log conversion differs from HLG's in how the signal becomes light,
  its curve a uniform of each lens, and in the gamut's and the tone's values; the tone's shape, the
  exposure signal and the gain matching between them (ADR 0012) are HLG's.

## Alternatives considered

- Insta360's LUT itself, as a 3D texture: Studio's LUT downloads do not list the X6, and the file
  is Insta360's to distribute.
- A fitted 3D table, 1.8 levels: the closest on this recording, but nearly five thousand colours
  that know only what one scene held, where a curve of 17 points and a matrix carry the encoding's
  structure into colours it did not show.
- BT.2087's published matrix, 3.2 levels: nothing fitted but the curve, but its sky some 4 levels
  too green, which a screenshot shows as a teal lean against Studio's.
- The tone fitted too, 2.3 levels: under half a level closer, its tone curve no longer a display's.
- Standard mode's look: standard mode is about half again as saturated as Studio's LUT, on two
  recordings of one place, one in each mode, but nothing measures a look. The player shows what
  Studio shows.
- The bitstream alone: it does not tell I-Log from standard mode.

## Consequences

- An X6 I-Log recording has Studio's LUT colours to the fit's accuracy, in Chromium and WebKit. The
  fit is one recording's of one scene: highlights above the signal it held, deep shadows and
  colours more saturated than it showed are the curve's and the matrix's extrapolation.
  Provisional until another X6 I-Log recording, of another scene, plain and with its LUT, is scored
  on this fit.
- An I-Log recording looks plainer than a standard one, as it does in Studio: the LUT is about a
  third less saturated than standard mode.
- Every other camera's I-Log is drawn as recorded: add a recording and its two Studio exports to
  the local catalogue (ADR 0031), fit its LUT, and key it by its model and its capture mode.
- Gain matching compares the lenses' light, as for HLG, not their log values. The seam meter
  leaves out colours blown out in the exposure signal's 8 bits, as for HLG; where the X6 clips in
  I-Log is not measured, so a highlight clipped below that would stay in the gains' means.
- Filtering and mipmaps average log-encoded texels before the conversion, as they do HLG's
  (ADR 0033), and fine high-contrast detail seen minified comes out darker: more so than HLG's,
  I-Log's curve being the steeper.
- An 8-bit texel's step is about two levels of the converted picture in the middle tones. If a
  sky bands, `RGB10_A2` textures (ADR 0033) are the measurement to make.
