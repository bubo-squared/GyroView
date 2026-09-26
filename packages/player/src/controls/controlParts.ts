import { ensureInvariant } from '@gyroview/core';

import type { ChoiceMenuParts } from './ChoiceMenu';
import { ChoiceMenuName, choiceMenuClasses } from './controlsMarkup';

/**
 * The elements the controls bar drives, found once in the shadow tree.
 */
export interface ControlParts {
  readonly seek: HTMLInputElement;
  readonly play: HTMLButtonElement;
  readonly bigPlay: HTMLButtonElement;
  readonly stop: HTMLButtonElement;
  readonly time: HTMLElement;
  readonly mute: HTMLButtonElement;
  readonly volume: HTMLInputElement;
  readonly resetView: HTMLButtonElement;
  readonly stabilization: ChoiceMenuParts;
  readonly viewMode: ChoiceMenuParts;
  readonly fullscreen: HTMLButtonElement;
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

function queryChoiceMenu(root: ParentNode, name: ChoiceMenuName): ChoiceMenuParts {
  const classes = choiceMenuClasses(name);
  return {
    button: queryShadow(root, `.${classes.button}`, HTMLButtonElement),
    popup: queryShadow(root, `.${classes.popup}`, HTMLElement),
  };
}

export function queryControlParts(root: ParentNode): ControlParts {
  return {
    seek: queryShadow(root, '.seek', HTMLInputElement),
    play: queryShadow(root, '.play', HTMLButtonElement),
    bigPlay: queryShadow(root, '.big-play', HTMLButtonElement),
    stop: queryShadow(root, '.stop', HTMLButtonElement),
    time: queryShadow(root, '.time', HTMLElement),
    mute: queryShadow(root, '.mute', HTMLButtonElement),
    volume: queryShadow(root, '.volume', HTMLInputElement),
    resetView: queryShadow(root, '.reset-view', HTMLButtonElement),
    stabilization: queryChoiceMenu(root, ChoiceMenuName.Stabilization),
    viewMode: queryChoiceMenu(root, ChoiceMenuName.ViewMode),
    fullscreen: queryShadow(root, '.fullscreen', HTMLButtonElement),
  };
}
