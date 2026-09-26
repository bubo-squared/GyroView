import { afterEach, describe, expect, it } from 'vitest';

import { ChoiceMenu, type ChoiceMenuParts } from './ChoiceMenu';
import { choiceItem, removeRenderedControls, renderControls } from '../test/controls';

interface World {
  readonly parts: ChoiceMenuParts;
  readonly menu: ChoiceMenu;
  readonly chosen: string[];
  /**
   * Keys that got past the menu to the page.
   */
  readonly escapedKeys: string[];
  /**
   * A control of the bar outside the menu.
   */
  readonly outside: HTMLElement;
  readonly item: (choice: string) => HTMLElement;
}

/**
 * The View menu of the real controls, bound to a menu that records the choices made.
 */
function world(): World {
  const { root, parts } = renderControls();
  const bar = root.querySelector(':scope .controls') ?? root;
  const escapedKeys: string[] = [];
  root.addEventListener('keydown', (event) => {
    escapedKeys.push(event.key);
  });
  const chosen: string[] = [];
  const menu = new ChoiceMenu(bar, parts.viewMode, (choice) => {
    chosen.push(choice);
  });
  menu.markChosen('equirectangular');
  return {
    parts: parts.viewMode,
    menu,
    chosen,
    escapedKeys,
    outside: parts.play,
    item: (choice) => choiceItem(parts.viewMode.popup, choice),
  };
}

function press(target: Element, key: string, isShiftPressed = false): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey: isShiftPressed, bubbles: true, composed: true }),
  );
}

afterEach(() => {
  removeRenderedControls();
});

describe('ChoiceMenu', () => {
  it('opens and closes on its button, focusing the checked choice', () => {
    const { parts, item } = world();
    parts.button.click();
    expect(parts.popup.hidden).toBe(false);
    expect(parts.button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(item('equirectangular'));
    parts.button.click();
    expect(parts.popup.hidden).toBe(true);
    expect(parts.button.getAttribute('aria-expanded')).toBe('false');
  });

  it('checks exactly the choice it is told', () => {
    const { menu, item } = world();
    menu.markChosen('raw-lenses');
    const checked = ['normal', 'equirectangular', 'raw-lenses'].map((choice) =>
      item(choice).getAttribute('aria-checked'),
    );
    expect(checked).toEqual(['false', 'false', 'true']);
  });

  it('reports a choice, closes and hands the focus back to its button', () => {
    const { parts, chosen, item } = world();
    parts.button.click();
    item('raw-lenses').click();
    expect(chosen).toEqual(['raw-lenses']);
    expect(parts.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(parts.button);
  });

  it('closes on Escape and keeps the key from the page', () => {
    const { parts, escapedKeys, item } = world();
    parts.button.click();
    press(item('equirectangular'), 'Escape');
    expect(parts.popup.hidden).toBe(true);
    expect(escapedKeys).toEqual([]);
    press(parts.button, 'Escape');
    expect(escapedKeys).toEqual(['Escape']);
  });

  it('takes a press outside it only to close, and lets presses through once closed', () => {
    const { parts, outside } = world();
    const pressed: string[] = [];
    outside.addEventListener('pointerdown', () => {
      pressed.push('outside');
    });
    const pressOutside = (): void => {
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    };
    parts.button.click();
    pressOutside();
    expect(parts.popup.hidden).toBe(true);
    expect(pressed).toEqual([]);
    pressOutside();
    expect(pressed).toEqual(['outside']);
  });

  it('closes when the focus moves elsewhere, not within it', () => {
    const { parts, item, outside } = world();
    parts.button.click();
    item('raw-lenses').focus();
    expect(parts.popup.hidden).toBe(false);
    outside.focus();
    expect(parts.popup.hidden).toBe(true);
  });

  it('moves between the choices with the arrows, Home and End, keeping the keys', () => {
    const { parts, escapedKeys, item } = world();
    parts.button.click();
    press(item('equirectangular'), 'ArrowDown');
    expect(document.activeElement).toBe(item('raw-lenses'));
    press(item('raw-lenses'), 'ArrowDown');
    expect(document.activeElement).toBe(item('normal'));
    press(item('normal'), 'ArrowUp');
    expect(document.activeElement).toBe(item('raw-lenses'));
    press(item('raw-lenses'), 'Home');
    expect(document.activeElement).toBe(item('normal'));
    press(item('normal'), 'End');
    expect(document.activeElement).toBe(item('raw-lenses'));
    press(item('raw-lenses'), ' ');
    expect(escapedKeys).toEqual([]);
  });

  it('keeps its choices out of the tab order, and closes on Tab either way', () => {
    const { parts, item } = world();
    expect(item('normal').tabIndex).toBe(-1);
    parts.button.click();
    press(item('equirectangular'), 'Tab', true);
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
