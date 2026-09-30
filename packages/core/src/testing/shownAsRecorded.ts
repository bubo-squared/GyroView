import { AS_RECORDED, type DisplayConversion } from '../domain/colour/DisplayConversion';
import type { LensLayout } from '../domain/stitching/LensLayout';
import { lensFrameOrder } from '../domain/stitching/StitchingSetup';

/**
 * Every frame source of `layout` shown as recorded: the display conversions of a setup whose
 * colour does not matter, or that is drawn in the recording's own values, as the measurements
 * compare them.
 */
export function shownAsRecorded(layout: LensLayout): DisplayConversion[] {
  return lensFrameOrder(layout).map(() => AS_RECORDED);
}
