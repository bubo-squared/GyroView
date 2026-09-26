import {
  STABILIZATION_MODES,
  VIEW_MODES,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';

import styles from './styles.css?raw';
import { ICONS } from '../controls/icons';

/**
 * The menu's words for each choice; a record, so a new mode cannot be left without a label.
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
  /**
   * Names the button `.<name>-button` and its popup `.<name>-menu`.
   */
  readonly name: string;
  readonly title: string;
  readonly icon: string;
  readonly items: string;
}

/**
 * A button opening a popup of choices; the popup's title repeats the button's label for sight.
 */
function choiceMenuOf(menu: ChoiceMenuMarkup): string {
  return `<div class="choice">
        <button class="${menu.name}-button" type="button" aria-label="${menu.title}" aria-haspopup="menu" aria-expanded="false">${menu.icon}</button>
        <div class="popup ${menu.name}-menu" hidden>
          <p class="popup-title" aria-hidden="true">${menu.title}</p>
          <div role="menu" aria-label="${menu.title}">${menu.items}</div>
        </div>
      </div>`;
}

/**
 * The shadow tree, built once per element. Class names are the contract between this markup,
 * the stylesheet and the code that queries it; `part` names are the embedder's styling hooks.
 */
export const ELEMENT_TEMPLATE = `
<style>${styles}</style>
<div class="stage" part="stage">
  <canvas part="canvas"></canvas>
  <img class="poster" part="poster" alt="" />
  <audio hidden></audio>
  <div class="overlay loading" role="status" aria-label="Loading"><div class="spinner"></div></div>
  <div class="overlay error" role="alert">
    <p class="error-message"></p>
    <p class="error-code"></p>
  </div>
  <button class="big-play" type="button" aria-label="Play">${ICONS.play}</button>
  <div class="controls" part="controls">
    <input class="seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="Seek" />
    <div class="row">
      <button class="play" type="button" aria-label="Play">${ICONS.play}</button>
      <button class="stop" type="button" aria-label="Stop">${ICONS.stop}</button>
      <span class="time">0:00 / 0:00</span>
      <span class="spacer"></span>
      <button class="mute" type="button" aria-label="Mute" aria-pressed="false">${ICONS.sound}</button>
      <input class="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
      <button class="reset-view" type="button" aria-label="Reset view">${ICONS.resetView}</button>
      ${choiceMenuOf({
        name: 'stabilization',
        title: 'Stabilization',
        icon: ICONS.stabilization,
        items: menuItemsOf(STABILIZATION_MODES, STABILIZATION_LABELS),
      })}
      ${choiceMenuOf({
        name: 'view-mode',
        title: 'View',
        icon: ICONS.viewMode,
        items: menuItemsOf(VIEW_MODES, VIEW_MODE_LABELS),
      })}
      <button class="fullscreen" type="button" aria-label="Fullscreen">${ICONS.fullscreen}</button>
    </div>
  </div>
</div>
`;
