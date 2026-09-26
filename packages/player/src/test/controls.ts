import { expect } from 'vitest';

import { queryControlParts, type ControlParts } from '../controls/controlParts';
import { CONTROLS_MARKUP } from '../controls/controlsMarkup';

/**
 * The controls' real markup in the page, and its parts as the controls find them.
 */
export interface ControlsFixture {
  readonly root: HTMLElement;
  readonly parts: ControlParts;
}

const fixtures: HTMLElement[] = [];

export function renderControls(): ControlsFixture {
  const root = document.createElement('div');
  root.innerHTML = CONTROLS_MARKUP;
  document.body.append(root);
  fixtures.push(root);
  return { root, parts: queryControlParts(root) };
}

/**
 * Takes every rendered fixture out of the page again.
 */
export function removeRenderedControls(): void {
  for (const root of fixtures.splice(0)) root.remove();
}

/**
 * The choice item of a menu, found by the choice it names.
 */
export function choiceItem(popup: HTMLElement, choice: string): HTMLElement {
  const items = popup.querySelectorAll<HTMLElement>(':scope [role="menuitemradio"]');
  const found = [...items].find((item) => item.dataset['choice'] === choice);
  if (!found) throw new Error(`the menu offers no ${choice}`);
  return found;
}

/**
 * The button draws its state as one icon, never as a text glyph a font could colour.
 */
export function expectIconOnly(button: Element): void {
  expect(button.querySelectorAll('svg.icon')).toHaveLength(1);
  expect(button.textContent).toBe('');
}
