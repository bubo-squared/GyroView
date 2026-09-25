import { DEFAULT_VIEW, degrees } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import {
  isBooleanAttributeSet,
  shouldMatchGains,
  shouldPreload,
  parseNumber,
  sourceFromAttributes,
  stabilizationFromAttribute,
  viewAfterAttribute,
  viewModeFromAttribute,
} from './attributes';

const BASE = 'https://site.example/pages/embed.html';

function readerOf(attributes: Record<string, string>): (name: string) => string | null {
  return (name): string | null => attributes[name] ?? null;
}

describe('sourceFromAttributes', () => {
  it('resolves src, src2 and a proxy URL against the document and reads the quality', () => {
    const { source, problems } = sourceFromAttributes(
      readerOf({
        src: '../clips/VID_00.insv',
        src2: 'https://cdn.example/VID_10.insv',
        proxy: '../clips/LRV_01.lrv',
        quality: 'Full',
      }),
      BASE,
    );
    expect(source).toEqual({
      main: { url: 'https://site.example/clips/VID_00.insv' },
      second: { url: 'https://cdn.example/VID_10.insv' },
      proxy: { url: 'https://site.example/clips/LRV_01.lrv' },
      shouldDiscoverProxy: false,
      quality: 'full',
    });
    expect(problems).toEqual([]);
  });

  it('looks for the proxy by default, never with proxy="none"', () => {
    expect(sourceFromAttributes(readerOf({ src: 'a.insv' }), BASE).source).toMatchObject({
      proxy: undefined,
      shouldDiscoverProxy: true,
      quality: 'auto',
    });
    expect(
      sourceFromAttributes(readerOf({ src: 'a.insv', proxy: 'none' }), BASE).source,
    ).toMatchObject({ proxy: undefined, shouldDiscoverProxy: false });
  });

  it('has no source without src and reports an unknown quality while playing on', () => {
    expect(sourceFromAttributes(readerOf({}), BASE)).toEqual({ source: undefined, problems: [] });
    expect(sourceFromAttributes(readerOf({ src: '  ' }), BASE).source).toBeUndefined();
    const parsed = sourceFromAttributes(readerOf({ src: 'a.insv', quality: 'best' }), BASE);
    expect(parsed.source?.quality).toBe('auto');
    expect(parsed.problems).toEqual(['ignoring quality="best"; expected one of auto, full, proxy']);
  });
});

describe('view and playback attributes', () => {
  it('changes only the angle the attribute names, clamped, and keeps the others', () => {
    const turned = { ...DEFAULT_VIEW, pitch: degrees(-20) };
    expect(viewAfterAttribute(turned, 'yaw', '370')).toEqual({ ...turned, yaw: 10 });
    expect(viewAfterAttribute(turned, 'fov', '300').fieldOfView).toBe(120);
  });

  it('keeps the view for an absent or unreadable value or another attribute', () => {
    expect(viewAfterAttribute(DEFAULT_VIEW, 'fov', 'wide')).toBe(DEFAULT_VIEW);
    expect(viewAfterAttribute(DEFAULT_VIEW, 'pitch', null)).toBe(DEFAULT_VIEW);
    expect(viewAfterAttribute(DEFAULT_VIEW, 'loop', '5')).toBe(DEFAULT_VIEW);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('NaN')).toBeUndefined();
  });

  it('accepts only the known stabilization and view modes, case-insensitively', () => {
    expect(stabilizationFromAttribute('Horizon')).toBe('horizon');
    expect(stabilizationFromAttribute('wobble')).toBeUndefined();
    expect(stabilizationFromAttribute(null)).toBeUndefined();
    expect(viewModeFromAttribute(' Equirectangular ')).toBe('equirectangular');
    expect(viewModeFromAttribute('RAW-LENSES')).toBe('raw-lenses');
    expect(viewModeFromAttribute('stereographic')).toBeUndefined();
  });

  it('treats boolean attributes as set by presence', () => {
    expect(isBooleanAttributeSet('')).toBe(true);
    expect(isBooleanAttributeSet('false')).toBe(true);
    expect(isBooleanAttributeSet(null)).toBe(false);
  });

  it('preloads unless told none', () => {
    expect(shouldPreload(null)).toBe(true);
    expect(shouldPreload('auto')).toBe(true);
    expect(shouldPreload('None')).toBe(false);
  });

  it('matches gains unless told off', () => {
    expect(shouldMatchGains(null)).toBe(true);
    expect(shouldMatchGains('on')).toBe(true);
    expect(shouldMatchGains('OFF')).toBe(false);
  });
});
