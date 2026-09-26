import {
  STABILIZATION_MODES,
  VIEW_MODES,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import { ICONS } from './icons';

/**
 * The bar's choice menus, by the name their parts are found under.
 */
export const ChoiceMenuName = {
  Stabilization: 'stabilization',
  ViewMode: 'view-mode',
} as const;

export type ChoiceMenuName = (typeof ChoiceMenuName)[keyof typeof ChoiceMenuName];

/**
 * The class names of a choice menu's button and popup, for the markup and the query alike.
 */
export function choiceMenuClasses(name: ChoiceMenuName): { button: string; popup: string } {
  return { button: `${name}-button`, popup: `${name}-menu` };
}

/**
 * The menus' words for each choice; a record, so a new mode cannot be left without a label.
 */
const STABILIZATION_LABELS: Readonly<Record<StabilizationMode, string>> = {
  off: 'Off',
  lock: 'Lock',
  horizon: 'Horizon',
  follow: 'Follow',
};
const VIEW_MODE_LABELS: Readonly<Record<ViewMode, string>> = {
  normal: 'Normal',
  equirectangular: 'Equirectangular',
  'raw-lenses': 'Raw lenses',
};

function menuItemsOf<Choice extends string>(
  choices: readonly Choice[],
  labels: Readonly<Record<Choice, string>>,
): string {
  return choices
    .map(
      (choice) =>
        `<button type="button" role="menuitemradio" aria-checked="false" data-choice="${choice}">${labels[choice]}</button>`,
    )
    .join('');
}

interface ChoiceMenuMarkup {
  readonly name: ChoiceMenuName;
  readonly title: string;
  readonly icon: string;
  readonly items: string;
}

/**
 * A button opening a popup of choices; the popup's title repeats the button's label for sight.
 */
function choiceMenuOf(menu: ChoiceMenuMarkup): string {
  const classes = choiceMenuClasses(menu.name);
  return `<div class="choice">
        <button class="${classes.button}" type="button" aria-label="${menu.title}" aria-haspopup="menu" aria-expanded="false">${menu.icon}</button>
        <div class="popup ${classes.popup}" hidden>
          <p class="popup-title" aria-hidden="true">${menu.title}</p>
          <div role="menu" aria-label="${menu.title}">${menu.items}</div>
        </div>
      </div>`;
}

/**
 * The big play button and the control bar, for the element's stage. Class names are the contract
 * with `queryControlParts` and the stylesheet; the controls give the play and mute buttons their
 * state-dependent labels and icons when they are bound.
 */
export const CONTROLS_MARKUP = `
  <button class="big-play" type="button">${ICONS.play}</button>
  <div class="controls" part="controls">
    <input class="seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="Seek" />
    <div class="row">
      <button class="play" type="button"></button>
      <button class="stop" type="button" aria-label="Stop">${ICONS.stop}</button>
      <span class="time">0:00 / 0:00</span>
      <span class="spacer"></span>
      <button class="mute" type="button" aria-label="Mute"></button>
      <input class="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
      <button class="reset-view" type="button" aria-label="Reset view">${ICONS.resetView}</button>
      ${choiceMenuOf({
        name: ChoiceMenuName.Stabilization,
        title: 'Stabilization',
        icon: ICONS.stabilization,
        items: menuItemsOf(STABILIZATION_MODES, STABILIZATION_LABELS),
      })}
      ${choiceMenuOf({
        name: ChoiceMenuName.ViewMode,
        title: 'View',
        icon: ICONS.viewMode,
        items: menuItemsOf(VIEW_MODES, VIEW_MODE_LABELS),
      })}
      <button class="fullscreen" type="button" aria-label="Fullscreen">${ICONS.fullscreen}</button>
    </div>
  </div>`;
