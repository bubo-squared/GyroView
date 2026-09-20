import { describe, expect, it } from 'vitest';

import { elementSourceOf } from './elementSource';
import { isUrlInput, type MediaInput } from '../PlayerSource';

const BASE = 'https://site.example/';

function readerOf(attributes: Record<string, string>): (name: string) => string | null {
  return (name): string | null => attributes[name] ?? null;
}

function blobOf(input: MediaInput | undefined): Blob | undefined {
  return input === undefined || isUrlInput(input) ? undefined : input.blob;
}

describe('elementSourceOf', () => {
  it('plays the given files, keeping the quality attribute', () => {
    const main = new File([], 'VID_00.insv');
    const proxy = new File([], 'LRV_01.lrv');

    const { source, problems } = elementSourceOf(readerOf({ quality: 'proxy' }), BASE, {
      main,
      proxy,
    });

    expect(blobOf(source?.main)).toBe(main);
    expect(blobOf(source?.proxy)).toBe(proxy);
    expect(source).toMatchObject({
      main: { name: 'VID_00.insv' },
      second: undefined,
      proxy: { name: 'LRV_01.lrv' },
      shouldDiscoverProxy: false,
      quality: 'proxy',
    });
    expect(problems).toEqual([]);
  });

  it('falls back to the attributes without files', () => {
    const { source } = elementSourceOf(readerOf({ src: 'clip.insv' }), BASE, undefined);
    expect(source?.main).toEqual({ url: 'https://site.example/clip.insv' });
  });
});
