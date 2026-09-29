import { DataTexture } from 'three';
import { describe, it } from 'vitest';

import { LAB_CHUNKS, LAB_DEFINES } from './labPrograms';
import { createSeamJoinUniforms } from './seamJoin';
import { createSeamMismatchUniforms } from './seamMismatch/SeamMismatchPass';
import { SEAM_ANALYSIS } from '../shaderPrograms';
import { baseUniforms, declaredIn, expectBound, expectDefinesRead } from '../test/shaderContract';

describe('the lab’s programs', () => {
  it('bind exactly the uniforms they declare, which extend the shared ones', () => {
    const uniforms = {
      ...createSeamMismatchUniforms(baseUniforms(), new DataTexture()),
      ...createSeamJoinUniforms(),
    };
    expectBound(declaredIn([LAB_CHUNKS, SEAM_ANALYSIS]), Object.keys(uniforms));
  });

  it('are given only defines a chunk reads, so no constant is dead on one side', () => {
    expectDefinesRead(LAB_DEFINES, LAB_CHUNKS);
  });
});
