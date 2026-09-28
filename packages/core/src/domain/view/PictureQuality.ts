/**
 * How finely the renderer reads the lens images for each screen pixel, and how many device
 * pixels it draws: `fast` reads one bilinear tap of the frame as decoded; `balanced` reads
 * through a mip chain over the pixel's footprint, which stops the shimmer where the frame is
 * minified; `high` adds extra taps and the screen's full pixel density.
 */
export type PictureQuality = 'fast' | 'balanced' | 'high';

export const PICTURE_QUALITIES: readonly PictureQuality[] = ['fast', 'balanced', 'high'];

/**
 * A mip chain per frame per lens is what every platform the player targets affords, and what
 * the equirectangular view and the raw tiles need to hold still.
 */
export const DEFAULT_PICTURE_QUALITY: PictureQuality = 'balanced';
