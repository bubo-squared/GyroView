# ADR 0024: Lens sampling reads the pixel's footprint, at a quality the page chooses

Status: accepted (2026-09-28)

## Context

The stitch read each lens image with one bilinear sample at the drawn pixel's position, from a
texture without mipmaps. The lens images are larger than the picture on most screens: a 5.7K
recording in the equirectangular view of a laptop window is minified about 2.5 times, an 8K
one 3.4 times. A bilinear sample of a minified image picks one of several source pixels it
should average, so fine detail aliases, and under `lock` stabilization, where the picture stands
still while the source pixels move under it, the aliasing shows as shimmer. The stitch's early
returns (outside the picture area, outside a lens's field) also left the screen derivatives
undefined near the seams, which rules out any sampling that needs them.

Three.js uploads a `VideoFrame` with `texImage2D` and generates the mip chain when asked, so a
mip chain costs one `generateMipmap` per uploaded frame and no copy.

## Decision

A picture quality, `fast`, `balanced` or `high`, chooses a sampling strategy and a drawing
buffer scale together; `balanced` is the default and the setting is kept across loads.

- `fast`: one bilinear sample, no mipmaps, one device pixel per CSS pixel. The cheapest picture,
  for weak GPUs.
- `balanced`: a mip chain per uploaded frame, read through `textureGrad` along each drawn pixel's
  footprint with anisotropy 4; the drawing buffer follows the screen's pixel ratio up to 2.
- `high`: the same chain, anisotropy 8, four samples on a rotated 2x2 grid averaged per pixel;
  the buffer follows the ratio up to 3, which covers every phone.

The footprint (the lens coordinates' screen derivatives) is taken before any gate, and every
picture program runs to its end without an early return, so the derivatives are defined on
every pixel, seams included. The footprint's samples are inset half a texel from the lens's
region of its frame, so the finest levels of a packed layout's two circles do not bleed into each
other; the coarsest levels of the chain average across the boundary regardless, and `high`'s
four taps sit around the inset centre, not inside it. The seam meters read the base level (`textureLod` 0), unchanged by the quality. The
strategy is a uniform, not a define: switching quality recompiles nothing and re-uploads only
the frames standing on screen.

## Consequences

- Minified detail averages instead of aliasing in `balanced` and `high`: the renderer's test
  reads 2-pixel stripes minified about seven times as grey in both, and lets `fast` alias. A
  solid colour stays exact through all three, so the qualities differ only where detail does.
- Measured (2026-09-28, `pnpm measure`, `samplingQuality.test.ts`, removed once this was settled) on a 1536 x 768 panorama
  under lock, on the sharpest 96 x 96 region of the `fast` picture, in levels of 255: the
  flicker is the mean difference between two consecutive frames, the aliasing the mean
  difference between the picture and the picture drawn at twice the size then box-filtered
  down. Chromium and WebKit draw the same picture to the level.

  | Sample        | Quality    | Flicker | Aliasing |
  | ------------- | ---------- | ------- | -------- |
  | office (5.7K) | `fast`     | 12.2    | 5.2      |
  |               | `balanced` | 6.0     | 3.0      |
  |               | `high`     | 6.6     | 1.5      |
  | sailing (8K)  | `fast`     | 39.1    | 11.3     |
  |               | `balanced` | 25.2    | 4.7      |
  |               | `high`     | 27.2    | 2.8      |

  The flicker that remains is the scene's own motion under lock (the office clip is handheld,
  the boat rolls). Each uploaded frame pays a `generateMipmap` in `balanced` and `high`; on an
  M4 Pro the render of a frame, upload included, stays within the run-to-run noise of `fast`
  (4 to 6 ms in Chromium, 1 to 4 ms in WebKit, at both sizes). The developer page shows the
  frame rate, the buffer size and the screen ratio beside the quality to judge it on other
  machines; `high` remains opt-in until a phone has been measured.

- `quality` is an attribute, a property, `setQuality` and `qualitychange` on the element, an
  option and a command of the embed, and `Player.setQuality` in the library.
- Bicubic magnification for the normal view, which magnifies the source on most screens, is not
  part of this decision.

## Alternatives considered

- Supersampling everywhere, no mipmaps: the sample count needed grows with the minification,
  eight or more taps at 3.4 times, for what the chain gives in one.
- Defines per quality: a recompile per switch, and three programs per picture to prove.
- Rendering the panorama once at the source's resolution and scaling it down: an intermediate
  target the size of the source per frame, more GPU time than the chain saves.
