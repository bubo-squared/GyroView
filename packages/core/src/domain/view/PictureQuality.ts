/**
 * How finely the renderer reads the lens images for each screen pixel, and how many device
 * pixels per CSS pixel the drawing buffer holds: `fast` reads one bilinear tap of the frame as
 * decoded, one device pixel per CSS pixel; `balanced` reads through a mip chain over the
 * pixel's footprint, which stops the shimmer where the frame is minified, up to two; `high`
 * adds extra taps, up to three (ADR 0024).
 */
export type PictureQuality = 'fast' | 'balanced' | 'high';

export const PICTURE_QUALITIES: readonly PictureQuality[] = ['fast', 'balanced', 'high'];

/**
 * A mip chain per frame per lens is what every platform the player targets affords, and what
 * the equirectangular view and the raw tiles need to hold still.
 */
export const DEFAULT_PICTURE_QUALITY: PictureQuality = 'balanced';

/**
 * The most device pixels per CSS pixel each quality draws: the screen's own ratio up to this.
 * Above two, the stitch's cost grows faster than what the eye gains from it, so only `high`
 * follows a phone's screen all the way.
 */
const PIXEL_RATIO_CAPS: Readonly<Record<PictureQuality, number>> = {
  fast: 1,
  balanced: 2,
  high: 3,
};

export function pixelRatioCapOf(quality: PictureQuality): number {
  return PIXEL_RATIO_CAPS[quality];
}
