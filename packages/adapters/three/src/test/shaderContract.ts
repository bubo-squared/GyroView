import { Texture } from 'three';
import { expect } from 'vitest';

import { MULTI_TRACK, setupAsRecorded } from './syntheticStitching';
import {
  createRendererUniforms,
  type RendererUniforms,
  type ShaderDefines,
} from '../rendererUniforms';

const UNIFORM_DECLARATION = /^uniform\s+\w+\s+(?<name>\w+)/gmu;

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * The uniforms the chunks of the given programs declare, each chunk read once.
 */
export function declaredIn(programs: readonly (readonly string[])[]): string[] {
  const chunks = [...new Set(programs.flat())];
  return [...chunks.join('\n').matchAll(UNIFORM_DECLARATION)].map(
    (match) => match.groups?.['name'] ?? '',
  );
}

export function expectBound(declared: readonly string[], bound: readonly string[]): void {
  expect(declared.toSorted(byName)).toEqual(bound.toSorted(byName));
  expect(new Set(declared).size).toBe(declared.length);
}

export function baseUniforms(): RendererUniforms {
  const setup = setupAsRecorded(MULTI_TRACK);
  return createRendererUniforms(setup, [new Texture(), new Texture()]);
}

export function expectDefinesRead(defines: ShaderDefines, chunks: readonly string[]): void {
  const source = chunks.join('\n');
  for (const name of Object.keys(defines)) {
    expect(source, name).toMatch(new RegExp(String.raw`\b${name}\b`, 'u'));
  }
}
