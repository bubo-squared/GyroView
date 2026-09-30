import {
  buildStitchingSetup,
  IDENTITY_MATRIX3,
  matrixCorrectionOf,
  type LensLayout,
  type LensStitch,
} from '@gyroview/core';
import { AS_RECORDED } from '@gyroview/core/testing';
import type { IUniform, Matrix3 } from 'three';
import { describe, expect, it } from 'vitest';

import { MatrixCorrections } from './matrixCorrections';
import { MULTI_TRACK, PACKED, syntheticCalibration } from './test/syntheticStitching';
import { toThreeMatrix } from './threeMatrix';

const RECORDED_AS_BT2020 = { ...AS_RECORDED, matrix: 'bt2020-ncl' } as const;

function lensesOf(layout: LensLayout): readonly LensStitch[] {
  const slots = layout.kind === 'packed' ? 1 : 2;
  return buildStitchingSetup({
    calibration: syntheticCalibration(),
    layout,
    displayConversions: Array.from({ length: slots }, () => RECORDED_AS_BT2020),
  }).lenses;
}

/**
 * A frame that names `matrix`, all the corrections read of it.
 */
function frameNaming(matrix: string): VideoFrame {
  return { colorSpace: { matrix } } as unknown as VideoFrame;
}

function uniformOf(lenses: readonly LensStitch[]): IUniform<Matrix3[]> {
  return { value: lenses.map(() => toThreeMatrix(IDENTITY_MATRIX3)) };
}

const FROM_BT709 = toThreeMatrix(matrixCorrectionOf('bt2020-ncl', 'bt709')).elements;
const NONE = toThreeMatrix(IDENTITY_MATRIX3).elements;

describe('MatrixCorrections', () => {
  it("corrects each lens by the matrix its own frame names, back to the track's", () => {
    const lenses = lensesOf(MULTI_TRACK);
    const uniform = uniformOf(lenses);
    new MatrixCorrections(lenses, uniform).follow([
      frameNaming('bt709'),
      frameNaming('bt2020-ncl'),
    ]);
    expect(uniform.value.map((matrix) => matrix.elements)).toEqual([FROM_BT709, NONE]);
  });

  it('corrects both halves of a packed frame alike', () => {
    const lenses = lensesOf(PACKED);
    const uniform = uniformOf(lenses);
    new MatrixCorrections(lenses, uniform).follow([frameNaming('bt709')]);
    expect(uniform.value.map((matrix) => matrix.elements)).toEqual([FROM_BT709, FROM_BT709]);
  });

  it('follows frames that change the matrix they name, and back', () => {
    const lenses = lensesOf(PACKED);
    const uniform = uniformOf(lenses);
    const corrections = new MatrixCorrections(lenses, uniform);
    corrections.follow([frameNaming('bt709')]);
    corrections.follow([frameNaming('bt2020-ncl')]);
    expect(uniform.value[0]?.elements).toEqual(NONE);
    corrections.follow([frameNaming('bt709')]);
    expect(uniform.value[0]?.elements).toEqual(FROM_BT709);
  });

  it('corrects nothing for a matrix the frame does not name', () => {
    const lenses = lensesOf(PACKED);
    const uniform = uniformOf(lenses);
    new MatrixCorrections(lenses, uniform).follow([frameNaming('ycgco')]);
    expect(uniform.value[0]?.elements).toEqual(NONE);
  });
});
