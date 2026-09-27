import { DEFAULT_VIEW, degrees } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import {
  isBooleanAttributeSet,
  shouldMatchGains,
  shouldPreload,
  parseNumber,
  sourceFromAttributes,
  unreadableAngleWarning,
  viewAfterAttribute,
} from './attributes';

const BASE = 'https://site.example/pages/embed.html';

function readerOf(attributes: Record<string, string>): (name: string) => string | null {
  return (name): string | null => attributes[name] ?? null;
}

describe('sourceFromAttributes', () => {
  it('resolves src and src2 against the document', () => {
    const source = sourceFromAttributes(
      readerOf({ src: '../clips/VID_00.insv', src2: 'https://cdn.example/VID_10.insv' }),
      BASE,
    );
    expect(source).toEqual({
      main: { url: 'https://site.example/clips/VID_00.insv' },
      second: { url: 'https://cdn.example/VID_10.insv' },
    });
  });

  it('has no source without src, and no second input without src2', () => {
    expect(sourceFromAttributes(readerOf({}), BASE)).toBeUndefined();
    expect(sourceFromAttributes(readerOf({ src: '  ' }), BASE)).toBeUndefined();
  });

  it('passes a src that is no URL on as written, for the load to fail on and report', () => {
    const source = sourceFromAttributes(readerOf({ src: 'http://[::1/x.insv' }), BASE);
    expect(source?.main).toEqual({ url: 'http://[::1/x.insv' });
    expect(
      sourceFromAttributes(readerOf({ src: 'a.insv', src2: ' ' }), BASE)?.second,
    ).toBeUndefined();
  });
});

describe('view and playback attributes', () => {
  it('changes only the angle the attribute names and keeps the others', () => {
    const turned = { ...DEFAULT_VIEW, pitch: degrees(-20) };
    expect(viewAfterAttribute(turned, 'yaw', '370')).toEqual({ ...turned, yaw: 370 });
    expect(viewAfterAttribute(turned, 'fov', '75').fieldOfView).toBe(75);
  });

  it('keeps the view for an absent or unreadable value or another attribute', () => {
    expect(viewAfterAttribute(DEFAULT_VIEW, 'fov', 'wide')).toBe(DEFAULT_VIEW);
    expect(viewAfterAttribute(DEFAULT_VIEW, 'pitch', null)).toBe(DEFAULT_VIEW);
    expect(viewAfterAttribute(DEFAULT_VIEW, 'loop', '5')).toBe(DEFAULT_VIEW);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('NaN')).toBeUndefined();
  });

  it('treats boolean attributes as set by presence', () => {
    expect(isBooleanAttributeSet('')).toBe(true);
    expect(isBooleanAttributeSet('false')).toBe(true);
    expect(isBooleanAttributeSet(null)).toBe(false);
  });

  it('preloads unless told none', () => {
    expect(shouldPreload(null)).toBe(true);
    expect(shouldPreload('auto')).toBe(true);
    expect(shouldPreload('metadata')).toBe(true);
    expect(shouldPreload(' None ')).toBe(false);
  });

  it('matches gains unless told off', () => {
    expect(shouldMatchGains(null)).toBe(true);
    expect(shouldMatchGains('on')).toBe(true);
    expect(shouldMatchGains('OFF')).toBe(false);
  });
});

describe('unreadableAngleWarning', () => {
  it('warns of a view attribute that names no number of degrees, and of nothing else', () => {
    expect(unreadableAngleWarning('fov', 'wide')).toEqual({
      code: 'ignored-attribute',
      message: 'ignoring fov="wide"; expected a number of degrees',
    });
    expect(unreadableAngleWarning('yaw', '30')).toBeUndefined();
    expect(unreadableAngleWarning('pitch', null)).toBeUndefined();
  });
});
