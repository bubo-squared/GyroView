import { buildStitchingSetup } from '@gyroview/core';
import { DataTexture, Texture } from 'three';
import { describe, expect, it } from 'vitest';

import { createRendererUniforms, SHADER_DEFINES, type RendererUniforms } from './rendererUniforms';
import { createSeamMismatchUniforms } from './seamMismatch/SeamMismatchPass';
import { ALL_CHUNKS, PICTURE_PROGRAMS, SEAM_ANALYSIS } from './shaderPrograms';
import { MULTI_TRACK, syntheticCalibration } from './test/syntheticStitching';

const UNIFORM_DECLARATION = /^uniform\s+\w+\s+(?<name>\w+)/gmu;

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * The uniforms the chunks of the given programs declare, each chunk read once.
 */
function declaredIn(programs: readonly (readonly string[])[]): string[] {
  const chunks = [...new Set(programs.flat())];
  return [...chunks.join('\n').matchAll(UNIFORM_DECLARATION)].map(
    (match) => match.groups?.['name'] ?? '',
  );
}

function expectBound(declared: readonly string[], bound: readonly string[]): void {
  expect(declared.toSorted(byName)).toEqual(bound.toSorted(byName));
  expect(new Set(declared).size).toBe(declared.length);
}

function baseUniforms(): RendererUniforms {
  const setup = buildStitchingSetup({ calibration: syntheticCalibration(), layout: MULTI_TRACK });
  return createRendererUniforms(setup, [new Texture(), new Texture()]);
}

describe('renderer uniforms', () => {
  it('binds exactly the uniforms the picture and seam analysis programs declare: three ignores a misspelt one', () => {
    expectBound(
      declaredIn([...Object.values(PICTURE_PROGRAMS), SEAM_ANALYSIS]),
      Object.keys(baseUniforms()),
    );
  });

  it('binds exactly the uniforms of every program in the seam mismatch set, which extends the shared ones', () => {
    const uniforms = createSeamMismatchUniforms(baseUniforms(), new DataTexture());
    expectBound(declaredIn([ALL_CHUNKS]), Object.keys(uniforms));
  });

  it('injects only defines a chunk reads, so no constant is dead on one side', () => {
    const source = ALL_CHUNKS.join('\n');
    for (const name of Object.keys(SHADER_DEFINES)) {
      expect(source, name).toMatch(new RegExp(String.raw`\b${name}\b`, 'u'));
    }
  });
});
