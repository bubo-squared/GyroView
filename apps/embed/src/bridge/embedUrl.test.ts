import { describe, expect, it } from 'vitest';

import { embedPageRequestOf, embedUrlFor } from './embedUrl';

const PAGE = 'https://player.example/embed.html';
/**
 * The `viewMode` option travels under its attribute's name.
 */
const VIEW_MODE_ATTRIBUTE = 'view-mode';

describe('embedUrlFor and embedPageRequestOf', () => {
  it('carries every option as a query parameter and reads it back as attributes', () => {
    const url = embedUrlFor(
      PAGE,
      {
        src: 'https://cdn.example/clip.insv',
        proxy: 'none',
        quality: 'full',
        fov: 75,
        yaw: -30,
        stabilization: 'horizon',
        viewMode: 'equirectangular',
        autoplay: true,
        muted: true,
        controls: false,
      },
      'https://site.example',
    );

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(PAGE);
    expect(parsed.searchParams.get('origin')).toBe('https://site.example');
    expect(embedPageRequestOf(parsed.searchParams)).toEqual({
      attributes: {
        src: 'https://cdn.example/clip.insv',
        proxy: 'none',
        quality: 'full',
        fov: '75',
        yaw: '-30',
        stabilization: 'horizon',
        [VIEW_MODE_ATTRIBUTE]: 'equirectangular',
        autoplay: '',
        muted: '',
      },
      embedderOrigin: 'https://site.example',
    });
  });

  it('shows controls unless told not to and accepts several spellings of a flag', () => {
    expect(embedPageRequestOf(new URLSearchParams('src=a.insv')).attributes).toEqual({
      src: 'a.insv',
      controls: '',
    });
    expect(
      embedPageRequestOf(new URLSearchParams('src=a.insv&controls=true&loop=YES&muted')).attributes,
    ).toEqual({
      src: 'a.insv',
      loop: '',
      muted: '',
      controls: '',
    });
    expect(embedPageRequestOf(new URLSearchParams('controls=0')).attributes).toEqual({});
    expect(embedPageRequestOf(new URLSearchParams('')).embedderOrigin).toBeUndefined();
  });
});
