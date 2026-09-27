import { describe, expect, it } from 'vitest';

import {
  defineBooleanProperties,
  defineKeywordProperties,
  defineStringProperties,
  propertyNameOf,
} from './reflectedProperties';

describe('reflected properties', () => {
  it('names properties after attributes, camel-casing hyphens', () => {
    expect(propertyNameOf('src')).toBe('src');
    expect(propertyNameOf('gain-match')).toBe('gainMatch');
    expect(propertyNameOf('a-b-c')).toBe('aBC');
  });

  it('mirrors an attribute through its property, removing it on null or undefined', () => {
    const element = document.createElement('div');
    defineStringProperties(element, ['gain-match']);
    const mirrored = element as unknown as HTMLElement & { gainMatch: string | null | undefined };
    mirrored.gainMatch = 'off';
    expect(element.getAttribute('gain-match')).toBe('off');
    element.setAttribute('gain-match', 'on');
    expect(mirrored.gainMatch).toBe('on');
    mirrored.gainMatch = null;
    expect(element.hasAttribute('gain-match')).toBe(false);
    mirrored.gainMatch = 'off';
    mirrored.gainMatch = undefined;
    expect(element.hasAttribute('gain-match')).toBe(false);
  });

  it('reads an enumerated attribute as the keyword in effect, and writes it as given', () => {
    const element = document.createElement('div');
    defineKeywordProperties(element, [
      { name: 'preload', keywords: ['none', 'auto'], fallback: 'auto' },
    ]);
    const mirrored = element as unknown as HTMLElement & { preload: string | null | undefined };
    expect(mirrored.preload).toBe('auto');
    element.setAttribute('preload', ' NONE ');
    expect(mirrored.preload).toBe('none');
    element.setAttribute('preload', 'metadata');
    expect(mirrored.preload).toBe('auto');
    mirrored.preload = 'none';
    expect(element.getAttribute('preload')).toBe('none');
    mirrored.preload = undefined;
    expect(element.hasAttribute('preload')).toBe(false);
  });

  it('coerces a boolean property as a media element does, so undefined never flips it', () => {
    const element = document.createElement('div');
    defineBooleanProperties(element, ['autoplay']);
    const mirrored = element as unknown as HTMLElement & { autoplay: unknown };
    mirrored.autoplay = undefined;
    expect(element.hasAttribute('autoplay')).toBe(false);
    mirrored.autoplay = 'yes';
    expect(element.hasAttribute('autoplay')).toBe(true);
    mirrored.autoplay = undefined;
    expect(element.hasAttribute('autoplay')).toBe(false);
  });
});
