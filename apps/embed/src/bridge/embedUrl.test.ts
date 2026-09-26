import { describe, expect, it } from 'vitest';

import { embedAttributesOf, embedUrlFor } from './embedUrl';

const PAGE = 'https://player.example/embed.html';

describe('embedUrlFor and embedAttributesOf', () => {
  it('carries every option as a query parameter and reads it back as attributes', () => {
    const url = embedUrlFor(
      PAGE,
      {
        src: 'https://cdn.example/clip.insv',
        src2: 'https://cdn.example/clip2.insv',
        fov: 75,
        yaw: -30,
        stabilization: 'horizon',
        viewMode: 'equirectangular',
        preload: 'none',
        gainMatch: 'off',
        poster: 'https://cdn.example/poster.jpg',
        autoplay: true,
        muted: true,
        controls: false,
      },
      'https://site.example',
    );

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(PAGE);
    expect(parsed.searchParams.get('origin')).toBe('https://site.example');
    expect(embedAttributesOf(parsed.searchParams)).toEqual({
      src: 'https://cdn.example/clip.insv',
      src2: 'https://cdn.example/clip2.insv',
      fov: '75',
      yaw: '-30',
      stabilization: 'horizon',
      'view-mode': 'equirectangular',
      preload: 'none',
      'gain-match': 'off',
      poster: 'https://cdn.example/poster.jpg',
      autoplay: '',
      muted: '',
    });
  });

  it('shows controls unless told not to and accepts several spellings of a flag', () => {
    expect(embedAttributesOf(new URLSearchParams('src=a.insv'))).toEqual({
      src: 'a.insv',
      controls: '',
    });
    expect(
      embedAttributesOf(new URLSearchParams('src=a.insv&controls=true&loop=YES&muted')),
    ).toEqual({
      src: 'a.insv',
      loop: '',
      muted: '',
      controls: '',
    });
    expect(embedAttributesOf(new URLSearchParams('controls=0'))).toEqual({});
  });
});
