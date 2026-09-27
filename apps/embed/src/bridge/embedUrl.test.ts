import { OBSERVED_ATTRIBUTES } from '@gyroview/player/attributes';
import { describe, expect, it } from 'vitest';

import { embedAttributesOf, embedUrlFor, withAbsoluteUrls, type EmbedOptions } from './embedUrl';

const PAGE = 'https://player.example/embed.html';
const SITE = 'https://site.example';

/**
 * Every option set: `Required` makes the compiler ask for an option added later.
 */
const EVERY_OPTION: Required<EmbedOptions> = {
  src: 'https://cdn.example/clip.insv',
  src2: 'https://cdn.example/clip2.insv',
  fov: 75,
  yaw: -30,
  pitch: 10,
  stabilization: 'horizon',
  viewMode: 'equirectangular',
  preload: 'none',
  gainMatch: 'off',
  poster: 'https://cdn.example/poster.jpg',
  autoplay: true,
  muted: true,
  loop: true,
  controls: false,
};

describe('embedUrlFor and embedAttributesOf', () => {
  it('carries every option as a query parameter and reads it back as attributes', () => {
    const parsed = new URL(embedUrlFor(PAGE, EVERY_OPTION, SITE));
    expect(parsed.origin + parsed.pathname).toBe(PAGE);
    expect(parsed.searchParams.get('origin')).toBe(SITE);
    expect(embedAttributesOf(parsed.searchParams)).toEqual({
      src: 'https://cdn.example/clip.insv',
      src2: 'https://cdn.example/clip2.insv',
      fov: '75',
      yaw: '-30',
      pitch: '10',
      stabilization: 'horizon',
      'view-mode': 'equirectangular',
      preload: 'none',
      'gain-match': 'off',
      poster: 'https://cdn.example/poster.jpg',
      autoplay: '',
      muted: '',
      loop: '',
    });
  });

  it('has a query parameter for every attribute of the element', () => {
    const parsed = new URL(embedUrlFor(PAGE, EVERY_OPTION, SITE));
    expect(OBSERVED_ATTRIBUTES.filter((name) => !parsed.searchParams.has(name))).toEqual([]);
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

describe('withAbsoluteUrls', () => {
  it('resolves the URLs the embedding page wrote against the page, not the frame', () => {
    const options = withAbsoluteUrls(
      { src: '/videos/clip.insv', src2: 'clip2.insv', poster: 'https://cdn.example/p.jpg', yaw: 5 },
      'https://blog.example/posts/trip.html',
    );
    expect(options).toEqual({
      src: 'https://blog.example/videos/clip.insv',
      src2: 'https://blog.example/posts/clip2.insv',
      poster: 'https://cdn.example/p.jpg',
      yaw: 5,
    });
  });

  it('passes on as written what the element would not resolve: a blank value, a URL that does not parse', () => {
    const options = withAbsoluteUrls(
      { src: 'http://[::1/x.insv', src2: '', poster: '  ' },
      'https://blog.example/posts/trip.html',
    );
    expect(options).toEqual({ src: 'http://[::1/x.insv', src2: '', poster: '  ' });
  });
});
