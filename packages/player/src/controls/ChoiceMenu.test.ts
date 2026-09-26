import { afterEach, describe, expect, it } from 'vitest';

import { ChoiceMenu, type ChoiceMenuParts } from './ChoiceMenu';

const CHOICES = ['near', 'middle', 'far'];

interface World {
  readonly root: HTMLElement;
  readonly parts: ChoiceMenuParts;
  readonly menu: ChoiceMenu;
  readonly chosen: string[];
  /**
   * Keys that got past the menu to the page.
   */
  readonly escapedKeys: string[];
  readonly item: (choice: string) => HTMLButtonElement;
}

const pages: HTMLElement[] = [];

function world(): World {
  const root = document.createElement('div');
  const button = document.createElement('button');
  const popup = document.createElement('div');
  popup.hidden = true;
  const items = CHOICES.map((choice) => {
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.dataset['choice'] = choice;
    popup.append(item);
    return item;
  });
  root.append(button, popup, document.createElement('output'));
  const page = document.createElement('div');
  page.append(root);
  document.body.append(page);
  pages.push(page);
  const escapedKeys: string[] = [];
  page.addEventListener('keydown', (event) => {
    escapedKeys.push(event.key);
  });
  const chosen: string[] = [];
  const parts = { button, popup };
  const menu = new ChoiceMenu(root, parts, (choice) => {
    chosen.push(choice);
  });
  menu.markChosen('middle');
  const item = (choice: string): HTMLButtonElement => items[CHOICES.indexOf(choice)] ?? button;
  return { root, parts, menu, chosen, escapedKeys, item };
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
}

afterEach(() => {
  for (const page of pages.splice(0)) page.remove();
});

describe('ChoiceMenu', () => {
  it('opens and closes on its button, focusing the checked choice', () => {
    const { parts, item } = world();
    parts.button.click();
    expect(parts.popup.hidden).toBe(false);
    expect(parts.button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(item('middle'));
    parts.button.click();
    expect(parts.popup.hidden).toBe(true);
    expect(parts.button.getAttribute('aria-expanded')).toBe('false');
  });

  it('checks exactly the choice it is told', () => {
    const { menu, item } = world();
    menu.markChosen('far');
    expect(CHOICES.map((choice) => item(choice).getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('reports a choice, closes and hands the focus back to its button', () => {
    const { parts, chosen, item } = world();
    parts.button.click();
    item('far').click();
    expect(chosen).toEqual(['far']);
    expect(parts.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(parts.button);
  });

  it('closes on Escape and keeps the key from the page', () => {
    const { parts, escapedKeys, item } = world();
    parts.button.click();
    press(item('middle'), 'Escape');
    expect(parts.popup.hidden).toBe(true);
    expect(escapedKeys).toEqual([]);
    press(parts.button, 'Escape');
    expect(escapedKeys).toEqual(['Escape']);
  });

  it('takes a press outside it only to close, and lets presses through once closed', () => {
    const { root, parts } = world();
    const pressed: string[] = [];
    const outside = root.querySelector('output');
    outside?.addEventListener('pointerdown', () => {
      pressed.push('outside');
    });
    const pressOutside = (): void => {
      outside?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    };
    parts.button.click();
    pressOutside();
    expect(parts.popup.hidden).toBe(true);
    expect(pressed).toEqual([]);
    pressOutside();
    expect(pressed).toEqual(['outside']);
  });

  it('closes when the focus moves elsewhere, not within it', () => {
    const { parts, item } = world();
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    parts.button.click();
    item('far').focus();
    expect(parts.popup.hidden).toBe(false);
    elsewhere.focus();
    expect(parts.popup.hidden).toBe(true);
    elsewhere.remove();
  });

  it('moves between the choices with the arrows, Home and End, keeping the keys', () => {
    const { parts, escapedKeys, item } = world();
    parts.button.click();
    press(item('middle'), 'ArrowDown');
    expect(document.activeElement).toBe(item('far'));
    press(item('far'), 'ArrowDown');
    expect(document.activeElement).toBe(item('near'));
    press(item('near'), 'ArrowUp');
    expect(document.activeElement).toBe(item('far'));
    press(item('far'), 'Home');
    expect(document.activeElement).toBe(item('near'));
    press(item('near'), 'End');
    expect(document.activeElement).toBe(item('far'));
    press(item('far'), ' ');
    expect(escapedKeys).toEqual([]);
  });

  it('closes on Tab either way, so the keys go back to the page with the menu shut', () => {
    const { parts, item } = world();
    parts.button.click();
    item('middle').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true }),
    );
    expect(parts.popup.hidden).toBe(true);
  });

  it('hides its button and closes when it is not available', () => {
    const { parts, menu } = world();
    parts.button.click();
    menu.setAvailable(false);
    expect(parts.button.hidden).toBe(true);
    expect(parts.popup.hidden).toBe(true);
    menu.setAvailable(true);
    expect(parts.button.hidden).toBe(false);
  });
});
