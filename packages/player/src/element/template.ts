import styles from './styles.css?raw';
import { CONTROLS_MARKUP } from '../controls/controlsMarkup';

/**
 * The shadow tree, built once per element: the stage with the canvas, poster, audio element and
 * overlays, and the controls' own markup. Class names are the contract between this markup, the
 * stylesheet and the code that queries it; `part` names are the embedder's styling hooks.
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
  ${CONTROLS_MARKUP}
</div>
`;
