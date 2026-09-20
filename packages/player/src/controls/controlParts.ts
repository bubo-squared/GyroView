import { ensureInvariant } from '@gyroview/core';

/**
 * The elements the controls bar drives, found once in the shadow tree.
 */
export interface ControlParts {
  readonly controls: HTMLElement;
  readonly seek: HTMLInputElement;
  readonly play: HTMLButtonElement;
  readonly bigPlay: HTMLButtonElement;
  readonly stop: HTMLButtonElement;
  readonly time: HTMLElement;
  readonly mute: HTMLButtonElement;
  readonly volume: HTMLInputElement;
  readonly resetView: HTMLButtonElement;
  readonly settings: HTMLButtonElement;
  readonly fullscreen: HTMLButtonElement;
  readonly menu: HTMLElement;
  readonly stabilization: HTMLSelectElement;
  readonly projection: HTMLSelectElement;
  readonly qualityRow: HTMLElement;
  readonly quality: HTMLSelectElement;
}

/**
 * The one element matching `selector`, checked to be of the expected kind.
 */
export function queryShadow<Found extends Element>(
  root: ParentNode,
  selector: string,
  kind: new () => Found,
): Found {
  const element = root.querySelector(selector);
  ensureInvariant(element instanceof kind, `the element template lacks ${selector}`);
  return element;
}

export function queryControlParts(root: ParentNode): ControlParts {
  return {
    controls: queryShadow(root, '.controls', HTMLElement),
    seek: queryShadow(root, '.seek', HTMLInputElement),
    play: queryShadow(root, '.play', HTMLButtonElement),
    bigPlay: queryShadow(root, '.big-play', HTMLButtonElement),
    stop: queryShadow(root, '.stop', HTMLButtonElement),
    time: queryShadow(root, '.time', HTMLElement),
    mute: queryShadow(root, '.mute', HTMLButtonElement),
    volume: queryShadow(root, '.volume', HTMLInputElement),
    resetView: queryShadow(root, '.reset-view', HTMLButtonElement),
    settings: queryShadow(root, '.settings', HTMLButtonElement),
    fullscreen: queryShadow(root, '.fullscreen', HTMLButtonElement),
    menu: queryShadow(root, '.menu', HTMLElement),
    stabilization: queryShadow(root, '.stabilization', HTMLSelectElement),
    projection: queryShadow(root, '.projection', HTMLSelectElement),
    qualityRow: queryShadow(root, '.quality-row', HTMLElement),
    quality: queryShadow(root, '.quality', HTMLSelectElement),
  };
}
