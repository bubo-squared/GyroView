import { buildStitchingSetup } from '@gyroview/core';
import { DataTexture, Texture } from 'three';
import { describe, expect, it } from 'vitest';

import { createRendererUniforms, SHADER_DEFINES, type RendererUniforms } from './rendererUniforms';
import { LAB_CHUNKS, LAB_DEFINES } from './lab/labPrograms';
import { createSeamJoinUniforms } from './lab/seamJoin';
import { createSeamMismatchUniforms } from './lab/seamMismatch/SeamMismatchPass';
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

function expectDefinesRead(
  defines: Readonly<Record<string, number>>,
  chunks: readonly string[],
): void {
  const source = chunks.join('\n');
  for (const name of Object.keys(defines)) {
    expect(source, name).toMatch(new RegExp(String.raw`\b${name}\b`, 'u'));
  }
}

describe('renderer uniforms', () => {
  it('binds exactly the uniforms the player’s picture and seam analysis programs declare: three ignores a misspelt one', () => {
    expectBound(
      declaredIn([...Object.values(PICTURE_PROGRAMS), SEAM_ANALYSIS]),
      Object.keys(baseUniforms()),
    );
  });

  it('binds exactly the uniforms of the lab’s programs, which extend the shared ones', () => {
    const base = baseUniforms();
    const uniforms = {
      ...createSeamMismatchUniforms(base, new DataTexture()),
      ...createSeamJoinUniforms(),
    };
    expectBound(declaredIn([LAB_CHUNKS, SEAM_ANALYSIS]), Object.keys(uniforms));
  });

  it('injects only defines a chunk reads, so no constant is dead on one side', () => {
    expectDefinesRead(SHADER_DEFINES, ALL_CHUNKS);
    expectDefinesRead(LAB_DEFINES, LAB_CHUNKS);
  });
});
