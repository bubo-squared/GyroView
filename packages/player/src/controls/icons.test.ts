import { describe, expect, it } from 'vitest';

import { ICONS } from './icons';

const TEXT_COLOUR_PAINTS = new Set(['currentColor', 'none']);

function shapesOf(markup: string): Element[] {
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  expect(svg.tagName).toBe('svg');
  return [svg, ...svg.querySelectorAll('*')];
}

describe('ICONS', () => {
  it.each(Object.entries(ICONS))('draws %s in the text colour only', (_name, markup) => {
    for (const shape of shapesOf(markup)) {
      for (const paint of ['fill', 'stroke']) {
        const value = shape.getAttribute(paint);
        if (value !== null) expect(TEXT_COLOUR_PAINTS).toContain(value);
      }
      expect(shape.hasAttribute('style')).toBe(false);
    }
  });

  it.each(Object.entries(ICONS))('hides %s from assistive technology', (_name, markup) => {
    expect(shapesOf(markup)[0]?.getAttribute('aria-hidden')).toBe('true');
  });
});
