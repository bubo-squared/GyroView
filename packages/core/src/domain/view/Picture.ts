import { boundsOf, clippedToScreen, type ScreenRectangle } from './screenLayout';
import type { Matrix3 } from '../../shared/math/Matrix3';
import type { Degrees } from '../../shared/units/angle';

/**
 * What a view mode draws: the stitched sphere flattened by one projection, turned into the
 * stabilized frame and placed in an area of the viewport, or each lens image in a tile of its
 * own. A renderer draws each kind with its own program.
 */
export type Picture = RectilinearPicture | EquirectangularPicture | LensTilesPicture;

export type PictureKind = Picture['kind'];

export interface RectilinearPicture {
  readonly kind: 'rectilinear';
  /**
   * Turns the picture's directions into the stabilized frame the viewer looks around in.
   */
  readonly rotation: Matrix3;
  /**
   * Across the area's width.
   */
  readonly fieldOfView: Degrees;
  readonly area: ScreenRectangle;
}

/**
 * A full turn across the area and a half turn from top to bottom.
 */
export interface EquirectangularPicture {
  readonly kind: 'equirectangular';
  readonly rotation: Matrix3;
  readonly area: ScreenRectangle;
}

/**
 * Each lens's image as decoded, one tile per lens in lens order.
 */
export interface LensTilesPicture {
  readonly kind: 'lens-tiles';
  readonly tiles: readonly ScreenRectangle[];
}

/**
 * The part of the viewport a picture draws on, within the viewport: a magnified panorama or lens
 * tiles may reach past its edges, and a letterboxed picture leaves the bars out.
 */
export function shownAreaOf(picture: Picture): ScreenRectangle {
  const area = picture.kind === 'lens-tiles' ? boundsOf(picture.tiles) : picture.area;
  return clippedToScreen(area);
}
