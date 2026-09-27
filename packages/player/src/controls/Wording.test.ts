import { describe, expect, it } from 'vitest';

import { queryShadow } from './controlParts';
import { Wording } from './Wording';

function markup(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('Wording', () => {
  it('fills in the labels, texts, menu choices and failures its markup names', () => {
    const root = markup(`
      <button data-label="stop"></button>
      <p data-text="viewMode"></p>
      <div data-choices="viewModes"><button data-choice="raw-lenses"></button></div>
      <p data-error="cors"></p>
      <button data-label="unknown"></button>`);
    new Wording().write(root);
    expect(root.querySelector('[data-label="stop"]')?.getAttribute('aria-label')).toBe('Stop');
    expect(root.querySelector('[data-text]')?.textContent).toBe('View');
    expect(root.querySelector('[data-choice]')?.textContent).toBe('Raw lenses');
    expect(root.querySelector('[data-error]')?.textContent).toBe('The video could not be loaded.');
    expect(root.querySelector('[data-label="unknown"]')?.hasAttribute('aria-label')).toBe(false);
  });

  it('rewrites every word after a change, a label given in code and a failure shown included', () => {
    const root = markup('<button class="play"></button><p class="error"></p>');
    const wording = new Wording();
    const play = queryShadow(root, '.play', HTMLButtonElement);
    const error = queryShadow(root, '.error', HTMLParagraphElement);
    wording.label(play, 'pause');
    wording.showError(error, 'codec-unsupported');
    expect(play.getAttribute('aria-label')).toBe('Pause');

    wording.replace({
      labels: { pause: 'Pausa' },
      errors: { 'codec-unsupported': 'No se puede.' },
    });
    wording.write(root);

    expect(play.getAttribute('aria-label')).toBe('Pausa');
    expect(error.textContent).toBe('No se puede.');
  });
});
