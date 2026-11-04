import { ensureInvariant, ROW_CORRECTION_COUNT, type Matrix3 as CoreMatrix3 } from '@gyroview/core';

import type { RendererUniforms } from './rendererUniforms';

/**
 * Sets the rows' rolling-shutter corrections, from the first row of a lens's window to its last,
 * or turns every row with the frame when there are none.
 */
export function applyRowCorrections(
  uniforms: Pick<RendererUniforms, 'uIsRowCorrected' | 'uRowCorrection'>,
  corrections: readonly CoreMatrix3[] | undefined,
): void {
  if (!corrections) {
    uniforms.uIsRowCorrected.value = false;
    return;
  }
  ensureInvariant(
    corrections.length === ROW_CORRECTION_COUNT,
    `a frame's rows take ${ROW_CORRECTION_COUNT} corrections, not ${corrections.length}`,
  );
  // Set in place, as the lens poses are: nine matrices a frame need not be made anew.
  for (const [index, rotation] of corrections.entries()) {
    uniforms.uRowCorrection.value[index]?.set(...rotation);
  }
  uniforms.uIsRowCorrected.value = true;
}
