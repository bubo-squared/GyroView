import { buildStitchingSetup } from '@gyroview/core';
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';

import { createRendererUniforms, SHADER_DEFINES } from './rendererUniforms';
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

  it('injects only defines a chunk reads, so no constant is dead on one side', () => {
    const source = ALL_CHUNKS.join('\n');
    for (const name of Object.keys(SHADER_DEFINES)) {
      expect(source, name).toMatch(new RegExp(String.raw`\b${name}\b`, 'u'));
    }
  });
});
