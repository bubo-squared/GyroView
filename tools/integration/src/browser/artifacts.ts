import { inject } from 'vitest';
import { commands, server } from 'vitest/browser';

function jsonDataUrl(value: unknown): string {
  return `data:application/json;base64,${btoa(JSON.stringify(value, undefined, 2))}`;
}

/**
 * Saves what a canvas shows to `.artifacts/`, under the browser's name, when the run writes
 * artifacts (`pnpm measure`); otherwise it does not even encode the picture.
 */
export async function saveRender(name: string, canvas: HTMLCanvasElement): Promise<void> {
  if (!inject('savesArtifacts')) return;
  await commands.saveArtifact(`${server.browser}-${name}.png`, canvas.toDataURL('image/png'));
}

/**
 * Draws a picture that only a saved render needs, and saves it, when the run writes artifacts;
 * otherwise it draws nothing.
 */
export async function drawAndSaveRender(
  name: string,
  canvas: HTMLCanvasElement,
  draw: () => void,
): Promise<void> {
  if (!inject('savesArtifacts')) return;
  draw();
  await saveRender(name, canvas);
}

/**
 * Saves a measurement as JSON to `.artifacts/`, under the browser's name, when the run writes
 * artifacts.
 */
export async function saveMeasurement(name: string, value: unknown): Promise<void> {
  if (!inject('savesArtifacts')) return;
  await commands.saveArtifact(`${server.browser}-${name}.json`, jsonDataUrl(value));
}
