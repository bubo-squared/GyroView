import { describe, expect, it } from 'vitest';

import { elementSourceOf, readThrough } from './elementSource';
import {
  isUrlInput,
  type MediaInput,
  type PlayerSource,
  type RecordingFetch,
} from '../PlayerSource';

const BASE = 'https://site.example/';

/**
 * A page's own fetch, sending each request as it is.
 */
const pageFetch: RecordingFetch = (url, init) => fetch(url, init);

function readerOf(attributes: Record<string, string>): (name: string) => string | null {
  return (name): string | null => attributes[name] ?? null;
}

function blobOf(input: MediaInput | undefined): Blob | undefined {
  return input === undefined || isUrlInput(input) ? undefined : input.blob;
}

describe('elementSourceOf', () => {
  it('plays the given files instead of what the attributes name', () => {
    const main = new File([], 'VID_00.insv');
    const second = new File([], 'VID_10.insv');

    const source = elementSourceOf(readerOf({ src: 'clip.insv' }), BASE, { main, second });

    expect(blobOf(source?.main)).toBe(main);
    expect(blobOf(source?.second)).toBe(second);
    expect(source).toMatchObject({
      main: { name: 'VID_00.insv' },
      second: { name: 'VID_10.insv' },
    });
  });

  it('falls back to the attributes without files', () => {
    const source = elementSourceOf(readerOf({ src: 'clip.insv' }), BASE, undefined);
    expect(source?.main).toEqual({ url: 'https://site.example/clip.insv' });
  });
});

describe('readThrough', () => {
  it("reads both files named by URL through the page's fetch, with their credentials", () => {
    const source: PlayerSource = {
      main: { url: 'https://site.example/VID_00.insv', credentials: 'include' },
      second: { url: 'https://site.example/VID_10.insv' },
    };

    expect(readThrough(source, pageFetch)).toStrictEqual({
      main: { url: 'https://site.example/VID_00.insv', credentials: 'include', fetch: pageFetch },
      second: { url: 'https://site.example/VID_10.insv', fetch: pageFetch },
    });
  });

  it('leaves local files as they are, since they are not fetched', () => {
    const source: PlayerSource = {
      main: { blob: new File([], 'VID_00.insv'), name: 'VID_00.insv' },
    };
    expect(readThrough(source, pageFetch).main).toBe(source.main);
  });

  it('leaves the source as it is without a fetch, adding no key to its inputs', () => {
    const source = elementSourceOf(
      readerOf({ src: 'clip.insv', src2: 'clip2.insv' }),
      BASE,
      undefined,
    );
    expect(source).toBeDefined();
    if (source === undefined) return;

    expect(readThrough(source, null)).toBe(source);
    expect(source).toStrictEqual({
      main: { url: 'https://site.example/clip.insv' },
      second: { url: 'https://site.example/clip2.insv' },
    });
  });
});
