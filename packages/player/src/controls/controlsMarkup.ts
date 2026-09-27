import { STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';

import controlsStyles from './controls.css?raw';
import { ICONS } from './icons';
import type { ChoiceTable, LabelName } from './messages';

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

function menuItemsOf(choices: readonly string[]): string {
  return choices
    .map(
      (choice) =>
        `<button type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-choice="${choice}"></button>`,
    )
    .join('');
}

interface ChoiceMenuMarkup {
  readonly name: ChoiceMenuName;
  readonly title: LabelName;
  readonly icon: string;
  readonly choices: ChoiceTable;
  readonly items: string;
}

/**
 * A button opening a popup of choices; the popup's title repeats the button's label for sight.
 * The words are the wording's to fill in.
 */
function choiceMenuOf(menu: ChoiceMenuMarkup): string {
  const classes = choiceMenuClasses(menu.name);
  return `<div class="choice">
        <button class="${classes.button}" type="button" data-label="${menu.title}" aria-haspopup="menu" aria-expanded="false">${menu.icon}</button>
        <div class="popup ${classes.popup}" hidden>
          <p class="popup-title" aria-hidden="true" data-text="${menu.title}"></p>
          <div role="menu" data-label="${menu.title}" data-choices="${menu.choices}">${menu.items}</div>
        </div>
      </div>`;
}

function pictureMenusMarkup(): string {
  const stabilization = choiceMenuOf({
    name: ChoiceMenuName.Stabilization,
    title: 'stabilization',
    icon: ICONS.stabilization,
    choices: 'stabilizationModes',
    items: menuItemsOf(STABILIZATION_MODES),
  });
  const viewMode = choiceMenuOf({
    name: ChoiceMenuName.ViewMode,
    title: 'viewMode',
    icon: ICONS.viewMode,
    choices: 'viewModes',
    items: menuItemsOf(VIEW_MODES),
  });
  return stabilization + viewMode;
}

/**
 * The controls' stylesheet, which the element adopts beside its own.
 */
export const CONTROLS_STYLES: string = controlsStyles;

/**
 * The big play button and the control bar, for the element's stage; built when first asked for,
 * so a page importing only the package's types and errors carries none of it. Class names are
 * the contract with `queryControlParts` and `controls.css`. It holds no words, which the
 * wording fills in, nor the play and mute buttons' state-dependent labels and icons, which
 * those buttons give themselves when they are bound.
 */
export function controlsMarkup(): string {
  return `
  <button class="big-play" part="big-play" type="button">${ICONS.play}</button>
  <div class="controls" part="controls">
    <input class="seek" type="range" min="0" max="0" step="0.01" value="0" data-label="seek" />
    <div class="row">
      <button class="play" type="button"></button>
      <button class="stop" type="button" data-label="stop">${ICONS.stop}</button>
      <span class="time">0:00 / 0:00</span>
      <span class="spacer"></span>
      <button class="mute" type="button" data-label="mute"></button>
      <input class="volume" type="range" min="0" max="1" step="0.01" value="1" data-label="volume" />
      <button class="reset-view" type="button" data-label="resetView">${ICONS.resetView}</button>
      ${pictureMenusMarkup()}
      <button class="fullscreen" type="button" data-label="fullscreen">${ICONS.fullscreen}</button>
    </div>
  </div>`;
}
