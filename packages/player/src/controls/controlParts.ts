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
  /**
   * The time shown beside the bar: where playback is, and the recording's length after it.
   */
  readonly elapsed: HTMLElement;
  readonly total: HTMLElement;
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
    icon: queryShadow(root, `.${classes.button} .setting-icon`, HTMLElement),
    popup: queryShadow(root, `.${classes.popup}`, HTMLElement),
    close: queryShadow(root, `.${classes.popup} .popup-close`, HTMLButtonElement),
  };
}

export function queryControlParts(root: ParentNode): ControlParts {
  return {
    seek: queryShadow(root, '.seek', HTMLInputElement),
    play: queryShadow(root, '.play', HTMLButtonElement),
    bigPlay: queryShadow(root, '.big-play', HTMLButtonElement),
    elapsed: queryShadow(root, '.time .elapsed', HTMLElement),
    total: queryShadow(root, '.time .total', HTMLElement),
    mute: queryShadow(root, '.mute', HTMLButtonElement),
    volume: queryShadow(root, '.volume', HTMLInputElement),
    resetView: queryShadow(root, '.reset-view', HTMLButtonElement),
    stabilization: queryChoiceMenu(root, ChoiceMenuName.Stabilization),
    viewMode: queryChoiceMenu(root, ChoiceMenuName.ViewMode),
    fullscreen: queryShadow(root, '.fullscreen', HTMLButtonElement),
  };
}
