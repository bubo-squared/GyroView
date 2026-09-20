import { describe, expect, it } from 'vitest';

import { embedderOriginOf } from './embedderOrigin';

describe('embedderOriginOf', () => {
  it('prefers the origin the snippet named, then the referrer', () => {
    expect(
      embedderOriginOf({
        query: new URLSearchParams('origin=https://site.example'),
        referrer: 'https://other.example/page',
        isEmbedded: true,
      }),
    ).toBe('https://site.example');
    expect(
      embedderOriginOf({
        query: new URLSearchParams(''),
        referrer: 'https://other.example/page',
        isEmbedded: true,
      }),
    ).toBe('https://other.example');
  });

  it('talks to nobody when standalone or when nothing trustworthy names the embedder', () => {
    expect(
      embedderOriginOf({
        query: new URLSearchParams('origin=https://site.example'),
        referrer: '',
        isEmbedded: false,
      }),
    ).toBeUndefined();
    expect(
      embedderOriginOf({ query: new URLSearchParams(''), referrer: '', isEmbedded: true }),
    ).toBeUndefined();
    expect(
      embedderOriginOf({
        query: new URLSearchParams('origin=null'),
        referrer: 'https://x.example',
        isEmbedded: true,
      }),
    ).toBeUndefined();
  });
});
