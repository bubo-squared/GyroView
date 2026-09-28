import type { FrameSink } from './FrameSink';
import type { SeamMeter } from './SeamMeter';
import type { SeamMismatchMeter } from './SeamMismatchMeter';
import type { Framing } from '../domain/view/Framing';
import type { PictureQuality } from '../domain/view/PictureQuality';
import type { ViewportSize } from '../domain/view/screenLayout';
import type { ViewMode } from '../domain/view/ViewMode';
import type { Matrix3 } from '../shared/math/Matrix3';
import type { Vector3 } from '../shared/math/Vector3';

/**
 * Port: what a player needs of a renderer. It draws each presented pair as the picture the
 * framing and the view mode ask for, turned by the stabilization and scaled by the lens gains, on
 * a surface of a given size, and can measure the seam of what it draws.
 */
export interface PictureRenderer<Handle = unknown> extends FrameSink<Handle> {
  /**
   * Turns the whole picture: `rotation` takes directions from the stabilized reference frame the
   * viewer looks around in into the camera body frame, and is applied after the view rotation
   * and before the lens poses. Takes effect with the next presentation.
   */
  setStabilization(rotation: Matrix3): void;
  /**
   * How the picture is framed in every view mode; the mode in effect reads its part.
   */
  setFraming(framing: Framing): void;
  setViewMode(mode: ViewMode): void;
  /**
   * How finely the lens images are read for each screen pixel. Redraws the frames on screen.
   */
  setQuality(quality: PictureQuality): void;
  /**
   * Matches the drawing buffer to a new surface size, in device pixels.
   */
  resize(size: ViewportSize): void;
  /**
   * The lenses it draws, which the raw lens tiles lay out one each.
   */
  readonly lensCount: number;
  /**
   * A meter over the seam of the pictures this renderer draws. Whoever creates it disposes it;
   * the renderer disposes any still live when it is disposed itself.
   */
  createSeamMeter(): SeamMeter;
  /**
   * Per-channel multipliers, one per lens in lens order: exposure matching, or silencing a lens
   * to inspect the other.
   */
  setLensGains(gains: readonly Vector3[]): void;
  /**
   * Replaces one lens's body-to-lens rotation, the calibration's or a refined one, for every
   * picture and meter from now on. Redraws the frames on screen.
   */
  setLensPose(lensIndex: number, rotation: Matrix3): void;
  /**
   * A meter of how the lenses disagree along the seam strip of the frames on screen, for
   * candidate poses of one lens. Whoever creates it disposes it; the renderer disposes any
   * still live when it is disposed itself.
   */
  createSeamMismatchMeter(): SeamMismatchMeter;
  dispose(): void;
}
