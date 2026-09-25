import styles from './styles.css?raw';

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
  <button class="big-play" type="button" aria-label="Play">&#9654;</button>
  <div class="controls" part="controls">
    <input class="seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="Seek" />
    <div class="row">
      <button class="play" type="button" aria-label="Play">&#9654;</button>
      <button class="stop" type="button" aria-label="Stop">&#9632;</button>
      <span class="time">0:00 / 0:00</span>
      <span class="spacer"></span>
      <button class="mute" type="button" aria-label="Mute" aria-pressed="false">&#128266;</button>
      <input class="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
      <button class="reset-view" type="button" aria-label="Reset view">&#8634;</button>
      <button class="settings" type="button" aria-label="Settings" aria-haspopup="true" aria-expanded="false">&#9881;</button>
      <button class="fullscreen" type="button" aria-label="Fullscreen">&#9974;</button>
    </div>
    <div class="menu" hidden>
      <label>Stabilization
        <select class="stabilization" aria-label="Stabilization">
          <option value="off">Off</option>
          <option value="lock">Lock</option>
          <option value="horizon">Horizon</option>
          <option value="follow">Follow</option>
        </select>
      </label>
      <label>View
        <select class="view-mode" aria-label="View">
          <option value="normal">Normal</option>
          <option value="equirectangular">Equirectangular</option>
        </select>
      </label>
      <label class="quality-row" hidden>Quality
        <select class="quality" aria-label="Quality">
          <option value="auto">Auto</option>
          <option value="full">Full</option>
          <option value="proxy">Proxy</option>
        </select>
      </label>
    </div>
  </div>
</div>
`;
