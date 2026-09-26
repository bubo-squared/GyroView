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
