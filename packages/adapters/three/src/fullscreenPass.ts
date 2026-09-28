import { BufferGeometry, Float32BufferAttribute, GLSL3, RawShaderMaterial } from 'three';

import { SHADER_DEFINES, type RendererUniforms } from './rendererUniforms';
import fullscreenVertex from './shaders/fullscreen.vert.glsl?raw';

/**
 * One triangle covering the clip square: two corners lie beyond it so its hypotenuse clears the
 * far edge. The fragment shader decides every pixel.
 */
const BEYOND_CLIP = 3;
const FULLSCREEN_TRIANGLE = [-1, -1, 0, BEYOND_CLIP, -1, 0, -1, BEYOND_CLIP, 0];
const POSITION_COMPONENTS = 3;

export function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(FULLSCREEN_TRIANGLE, POSITION_COMPONENTS),
  );
  return geometry;
}

/**
 * The GLSL chunks of a pass's fragment shader, joined in order, and the constants they refer to,
 * defined before them.
 */
export interface PassProgram {
  readonly chunks: readonly string[];
  readonly defines: Readonly<Record<string, number>>;
}

/**
 * The program of a pass whose chunks refer only to the constants of `rendererUniforms`.
 */
export function programOf(chunks: readonly string[]): PassProgram {
  return { chunks, defines: SHADER_DEFINES };
}

/**
 * A fullscreen pass over the shared uniforms. The raw shaders ignore the camera three still
 * wants to render with; each pass keeps its own.
 */
export function createPassMaterial(
  uniforms: RendererUniforms,
  program: PassProgram,
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    defines: { ...program.defines },
    vertexShader: fullscreenVertex,
    fragmentShader: program.chunks.join('\n'),
    uniforms: { ...uniforms },
    depthTest: false,
    depthWrite: false,
  });
}
