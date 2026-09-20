import { describe, expect, it } from 'vitest';

import { defineStringProperties, propertyNameOf } from './reflectedProperties';

describe('reflected properties', () => {
  it('names properties after attributes, camel-casing hyphens', () => {
    expect(propertyNameOf('src')).toBe('src');
    expect(propertyNameOf('gain-match')).toBe('gainMatch');
    expect(propertyNameOf('a-b-c')).toBe('aBC');
  });

  it('mirrors an attribute through its property, removing it on null', () => {
    const element = document.createElement('div');
    defineStringProperties(element, ['gain-match']);
    const mirrored = element as unknown as HTMLElement & { gainMatch: string | null };
    mirrored.gainMatch = 'off';
    expect(element.getAttribute('gain-match')).toBe('off');
    element.setAttribute('gain-match', 'on');
    expect(mirrored.gainMatch).toBe('on');
    mirrored.gainMatch = null;
    expect(element.hasAttribute('gain-match')).toBe(false);
  });
});
