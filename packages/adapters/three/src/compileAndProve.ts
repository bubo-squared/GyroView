import type { Camera, Scene, WebGLRenderer } from 'three';

/**
 * Compiles the programs `scene` needs and asks every program the renderer holds for its uniforms.
 * Three checks a program's link at its first use, and that request is one, so a shader the GPU
 * refuses fails here through the renderer's shader-error hook without a draw (which costs a
 * software renderer hundreds of milliseconds on the main thread).
 */
export function compileAndProve(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
  renderer.compile(scene, camera);
  const programs = renderer.info.programs ?? [];
  for (const program of programs) program.getUniforms();
}
