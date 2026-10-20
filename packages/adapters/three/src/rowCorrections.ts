import { ensureInvariant, ROW_CORRECTION_COUNT, type Matrix3 as CoreMatrix3 } from '@gyroview/core';

import type { RendererUniforms } from './rendererUniforms';
import { toThreeMatrix } from './threeMatrix';

/**
 * Sets the rows' rolling-shutter corrections, from the first row of a lens's window to its last,
 * or turns every row with the frame when there are none.
 */
export function applyRowCorrections(
  uniforms: Pick<RendererUniforms, 'uRowCorrected' | 'uRowCorrection'>,
  corrections: readonly CoreMatrix3[] | undefined,
): void {
  if (!corrections) {
    uniforms.uRowCorrected.value = false;
    return;
  }
  ensureInvariant(
    corrections.length === ROW_CORRECTION_COUNT,
    `a frame's rows take ${ROW_CORRECTION_COUNT} corrections, not ${corrections.length}`,
  );
  uniforms.uRowCorrection.value = corrections.map((rotation) => toThreeMatrix(rotation));
  uniforms.uRowCorrected.value = true;
}
