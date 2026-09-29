import { describe, it } from 'vitest';

import { SHADER_DEFINES } from './rendererUniforms';
import { PLAYER_CHUNKS, PICTURE_PROGRAMS, SEAM_ANALYSIS } from './shaderPrograms';
import { baseUniforms, declaredIn, expectBound, expectDefinesRead } from './test/shaderContract';

describe('renderer uniforms', () => {
  it('binds exactly the uniforms the player’s picture and seam analysis programs declare: three ignores a misspelt one', () => {
    expectBound(
      declaredIn([...Object.values(PICTURE_PROGRAMS), SEAM_ANALYSIS]),
      Object.keys(baseUniforms()),
    );
  });

  it('injects only defines a chunk reads, so no constant is dead on one side', () => {
    expectDefinesRead(SHADER_DEFINES, PLAYER_CHUNKS);
  });
});
