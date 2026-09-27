import type { WebGLRenderer, WebGLRenderTarget } from 'three';

/**
 * Runs `draw` with `target` bound, the renderer's own target restored however the drawing ends.
 */
export function renderInto(
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
  draw: () => void,
): void {
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    draw();
  } finally {
    renderer.setRenderTarget(previous);
  }
}
