import { GyroViewError } from '@gyroview/core';
import { WebGLRenderer } from 'three';

export interface ContextOptions {
  /**
   * Keep the drawing buffer after a frame, so tests can read it back and captures can save it;
   * costs a copy per frame, so off by default.
   */
  readonly preserveDrawingBuffer?: boolean;
}

/**
 * The WebGL 2 context a picture renderer draws on, wrapped by three, with every shader failure
 * made an error.
 */
export function createRenderer(canvas: HTMLCanvasElement, options: ContextOptions): WebGLRenderer {
  // The context attributes must be given here: three keeps a context it is handed as it is.
  const context = canvas.getContext('webgl2', {
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
  });
  if (!context) {
    throw new GyroViewError('render-unavailable', 'this browser has no WebGL2 context');
  }
  // A canvas keeps its context once lost: nothing restores one whose loss nobody prevented, and
  // three cannot read a lost context's attributes.
  if (context.isContextLost()) {
    throw new GyroViewError('render-unavailable', "the canvas's WebGL2 context has been lost");
  }
  const renderer = new WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(1);
  renderer.debug.onShaderError = (gl, program, ...shaders): void => {
    rejectProgram(gl, program, shaders);
  };
  return renderer;
}

/**
 * A shader that does not compile or link is a defect, not something to log and draw black over.
 * A compile failure's reason is in its shader's log, a link failure's in the program's.
 */
function rejectProgram(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  shaders: readonly WebGLShader[],
): never {
  const logs = [
    gl.getProgramInfoLog(program),
    ...shaders.map((shader) => gl.getShaderInfoLog(shader)),
  ];
  const log = logs.filter(Boolean).join('\n');
  throw new GyroViewError('render-unavailable', `a shader did not compile or link: ${log}`);
}
