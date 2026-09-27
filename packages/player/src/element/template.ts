import { lazy } from '@gyroview/core';

import styles from './styles.css?raw';
import { CONTROLS_STYLES, controlsMarkup } from '../controls/controlsMarkup';
import { parseMarkup } from '../controls/parseMarkup';

/**
 * The shadow tree: the stage with the canvas, poster, audio element and overlays, and the
 * controls' own markup. Class names are the contract between this markup, the stylesheet and the
 * code that queries it; `part` names are the embedder's styling hooks. The words are the
 * wording's to fill in.
 */
function elementMarkup(): string {
  return `
<div class="stage" part="stage">
  <canvas part="canvas"></canvas>
  <img class="poster" part="poster" alt="" />
  <audio hidden></audio>
  <div class="overlay loading" part="loading" role="status" data-label="loading">
    <div class="spinner"></div>
  </div>
  <div class="overlay error" part="error" role="alert">
    <p class="error-message" part="error-message"></p>
    <p class="error-code" part="error-code"></p>
  </div>
  ${controlsMarkup()}
</div>
`;
}

const parsedTree = lazy(() => parseMarkup(elementMarkup()));
const stylesheets = lazy(() => [styles, CONTROLS_STYLES].map((css) => stylesheetOf(css)));

/**
 * Fills a new element's shadow root with a copy of the tree, parsed once per page, and adopts
 * the stylesheets, built once and shared by every element. A Content Security Policy governs
 * `<style>` elements but not adopted stylesheets, so a page needs no `'unsafe-inline'` styles.
 */
export function renderShadowTree(shadow: ShadowRoot): void {
  shadow.adoptedStyleSheets = stylesheets();
  shadow.append(parsedTree().cloneNode(true));
}

function stylesheetOf(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}
