import { BufferGeometry, Camera, Float32BufferAttribute, GLSL3, RawShaderMaterial } from 'three';

import fullscreenVertex from './shaders/fullscreen.vert.glsl?raw';
import { SHADER_DEFINES, type StitchUniforms } from './stitchUniforms';

/**
 * One triangle covering the clip square: two corners lie beyond it so its hypotenuse clears the
 * far edge. The fragment shader decides every pixel.
 */
const BEYOND_CLIP = 3;
const FULLSCREEN_TRIANGLE = [-1, -1, 0, BEYOND_CLIP, -1, 0, -1, BEYOND_CLIP, 0];
const POSITION_COMPONENTS = 3;

/**
 * The raw shaders ignore the camera; three still wants one to render a scene.
 */
export const PASS_THROUGH_CAMERA = new Camera();

export function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(FULLSCREEN_TRIANGLE, POSITION_COMPONENTS),
  );
  return geometry;
}

/**
 * A fullscreen pass over the shared lens uniforms: the fragment shader is the given GLSL
 * sources joined in order, with the constants of `stitchUniforms` defined.
 */
export function createPassMaterial(
  uniforms: StitchUniforms,
  fragmentSources: readonly string[],
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    defines: { ...SHADER_DEFINES },
    vertexShader: fullscreenVertex,
    fragmentShader: fragmentSources.join('\n'),
    uniforms: { ...uniforms },
    depthTest: false,
    depthWrite: false,
  });
}
