import { describe, expect, it } from 'vitest';

import { referenceLensOf } from './referenceLensOf';
import { UPRIGHT_MOUNTING, type Mounting } from '../../domain/motion/mounting/Mounting';
import { IDENTITY_MATRIX3, rotationAboutX, rotationAboutY } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, HALF_TURN, QUARTER_TURN } from '../../shared/units/angle';

const LENS_0 = { rotation: IDENTITY_MATRIX3 };
const LENS_1 = { rotation: rotationAboutX(degreesToRadians(HALF_TURN)) };

/**
 * A mounting whose view opens along the body's minus x, across both lenses, as a lens-vertical
 * camera's does.
 */
const OPENING_ACROSS_THE_LENSES: Mounting = {
  name: 'lens-vertical',
  toBody: rotationAboutY(degreesToRadians(degrees(-QUARTER_TURN))),
};

describe('referenceLensOf', () => {
  it('is lens 1 where the view opens a half turn from lens 0, as on a level lens axis', () => {
    expect(referenceLensOf([LENS_0, LENS_1], UPRIGHT_MOUNTING)).toBe(1);
  });

  it("counts by the lenses' places in the setup", () => {
    expect(referenceLensOf([LENS_1, LENS_0], UPRIGHT_MOUNTING)).toBe(0);
  });

  it('is the first lens where the view opens across both, as on a lens-vertical camera', () => {
    expect(referenceLensOf([LENS_0, LENS_1], OPENING_ACROSS_THE_LENSES)).toBe(0);
  });

  it('is the one lens of a single-lens setup', () => {
    expect(referenceLensOf([LENS_0], UPRIGHT_MOUNTING)).toBe(0);
  });
});
