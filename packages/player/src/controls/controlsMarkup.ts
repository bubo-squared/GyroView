import { STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';

import controlsStyles from './controls.css?raw';
import { ICONS, STABILIZATION_ICONS, VIEW_MODE_ICONS } from './icons';
import { STABILIZATION_WORDS, VIEW_MODE_WORDS, type ChoiceWords, type LabelName } from './messages';

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
 * Each choice names itself in `data-choice` and shows its icon, and the words below it fill in
 * from the menu's tables: its name labels it for assistive technology and its description
 * describes it. Ids need be unique only within one element's shadow tree.
 */
function menuItemsOf(menu: ChoiceMenuMarkup): string {
  return menu.choices
    .map((choice) => {
      const id = `${menu.name}-${choice}`;
      return `<button type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-choice="${choice}" aria-labelledby="${id}-name" aria-describedby="${id}-description"><span class="choice-icon">${menu.icons[choice] ?? ''}</span><span class="choice-name" id="${id}-name" data-choice-text="${menu.words.names}"></span><span class="choice-description" id="${id}-description" data-choice-text="${menu.words.descriptions}"></span></button>`;
    })
    .join('');
}

interface ChoiceMenuMarkup {
  readonly name: ChoiceMenuName;
  readonly title: LabelName;
  readonly choices: readonly string[];
  readonly icons: Readonly<Record<string, string>>;
  readonly words: ChoiceWords;
}

/**
 * A setting button opening a popup of choices. The button shows the icon of the choice in effect,
 * which its `data-choice` names, and is named by words it never shows: what it sets and the
 * choice's name, which hidden elements still give through `aria-labelledby`. The popup's title
 * repeats what the button sets for sight; its close button serves the popup shown over the whole
 * player.
 */
function choiceMenuOf(menu: ChoiceMenuMarkup): string {
  const classes = choiceMenuClasses(menu.name);
  const [label, value] = [`${menu.name}-label`, `${menu.name}-value`];
  return `<div class="choice">
        <button class="icon-button setting ${classes.button}" type="button" aria-haspopup="menu" aria-expanded="false" aria-labelledby="${label} ${value}"><span class="setting-icon"></span><span hidden><span id="${label}" data-text="${menu.title}"></span> <span id="${value}" data-choice-text="${menu.words.names}"></span></span></button>
        <div class="popup ${classes.popup}" hidden>
          <div class="popup-header">
            <p class="popup-title" aria-hidden="true" data-text="${menu.title}"></p>
            <button class="icon-button popup-close" type="button" data-label="close">${ICONS.close}</button>
          </div>
          <div role="menu" data-label="${menu.title}">${menuItemsOf(menu)}</div>
        </div>
      </div>`;
}

function pictureMenusMarkup(): string {
  const stabilization = choiceMenuOf({
    name: ChoiceMenuName.Stabilization,
    title: 'stabilization',
    choices: STABILIZATION_MODES,
    icons: STABILIZATION_ICONS,
    words: STABILIZATION_WORDS,
  });
  const viewMode = choiceMenuOf({
    name: ChoiceMenuName.ViewMode,
    title: 'viewMode',
    choices: VIEW_MODES,
    icons: VIEW_MODE_ICONS,
    words: VIEW_MODE_WORDS,
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
      <button class="icon-button play" type="button"></button>
      <button class="icon-button mute" type="button" data-label="mute"></button>
      <input class="volume" type="range" min="0" max="1" step="0.01" value="1" data-label="volume" />
      <span class="time"><span class="elapsed">0:00</span> <span class="total">/ 0:00</span></span>
      <span class="spacer"></span>
      ${pictureMenusMarkup()}
      <button class="icon-button reset-view" type="button" data-label="resetView">${ICONS.resetView}</button>
      <button class="icon-button fullscreen" type="button" data-label="fullscreen">${ICONS.fullscreen}</button>
    </div>
  </div>`;
}
