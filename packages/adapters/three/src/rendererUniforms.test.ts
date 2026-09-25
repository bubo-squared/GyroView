import { buildStitchingSetup } from '@gyroview/core';
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';

import { createRendererUniforms } from './rendererUniforms';
import { ALL_CHUNKS } from './shaderPrograms';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';

const UNIFORM_DECLARATION = /^uniform\s+\w+\s+(?<name>\w+)/gmu;

function byName(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '');
}

describe('renderer uniforms', () => {
  it('binds exactly the uniforms the GLSL chunks declare: three ignores a misspelt one', () => {
    const declared = [...ALL_CHUNKS.join('\n').matchAll(UNIFORM_DECLARATION)].map(
      (match) => match.groups?.['name'],
    );
    const setup = buildStitchingSetup({ calibration: syntheticCalibration(), layout: MULTI_TRACK });
    const bound = Object.keys(createRendererUniforms(setup, [new Texture(), new Texture()]));
    expect(declared.toSorted(byName)).toEqual(bound.toSorted(byName));
    expect(new Set(declared).size).toBe(declared.length);
  });
});
