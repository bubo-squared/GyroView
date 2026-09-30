import {
  MATRIX_COEFFICIENTS,
  matrixCorrectionOf,
  type LensStitch,
  type MatrixCoefficients,
} from '@gyroview/core';
import type { IUniform, Matrix3 } from 'three';

import { toThreeMatrix } from './threeMatrix';

/**
 * Follows the matrix each lens's frames name, and brings their texels back to the matrix the
 * track was recorded with where the two differ (ADR 0033): WebKit's decoders convert Y′CbCr with
 * BT.709 whatever a stream says, and name BT.709 on the frames they make.
 */
export class MatrixCorrections {
  private readonly named: (MatrixCoefficients | undefined)[];

  public constructor(
    private readonly lenses: readonly LensStitch[],
    private readonly uniform: IUniform<Matrix3[]>,
  ) {
    this.named = Array.from<MatrixCoefficients | undefined>({ length: lenses.length });
  }

  /**
   * Updates a lens's correction when its frames name another matrix than before.
   */
  public follow(frames: readonly VideoFrame[]): void {
    for (const [index, lens] of this.lenses.entries()) {
      const frame = frames[lens.frameSlot];
      if (!frame) continue;
      const named = matrixNamed(frame.colorSpace.matrix);
      if (named === this.named[index]) continue;
      this.named[index] = named;
      this.uniform.value[index] = toThreeMatrix(
        matrixCorrectionOf(lens.displayConversion.matrix, named),
      );
    }
  }
}

function matrixNamed(matrix: string | null): MatrixCoefficients {
  return MATRIX_COEFFICIENTS.find((name) => name === matrix) ?? 'unspecified';
}
