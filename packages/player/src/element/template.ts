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

function optionsOf<Choice extends string>(
  choices: readonly Choice[],
  labels: Readonly<Record<Choice, string>>,
): string {
  return choices.map((choice) => `<option value="${choice}">${labels[choice]}</option>`).join('');
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
      <button class="settings" type="button" aria-label="Settings" aria-haspopup="true" aria-expanded="false">${ICONS.settings}</button>
      <button class="fullscreen" type="button" aria-label="Fullscreen">${ICONS.fullscreen}</button>
    </div>
    <div class="menu" hidden>
      <label>Stabilization
        <select class="stabilization" aria-label="Stabilization">
          ${optionsOf(STABILIZATION_MODES, STABILIZATION_LABELS)}
        </select>
      </label>
      <label>View
        <select class="view-mode" aria-label="View">
          ${optionsOf(VIEW_MODES, VIEW_MODE_LABELS)}
        </select>
      </label>

    </div>
  </div>
</div>
`;
