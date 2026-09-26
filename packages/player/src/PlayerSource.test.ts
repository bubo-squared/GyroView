import { describe, expect, it } from 'vitest';

import { inputName, isUrlInput } from './PlayerSource';

describe('inputName', () => {
  it('takes the decoded last path segment of a URL, ignoring the query', () => {
    expect(
      inputName({ url: 'https://cdn.example/clips/VID_20260814_132640_00_013.insv?x=1' }),
    ).toBe('VID_20260814_132640_00_013.insv');
    expect(inputName({ url: 'https://cdn.example/a%20clip.insv' })).toBe('a clip.insv');
  });

  it('reads a relative URL too', () => {
    expect(inputName({ url: 'media/clip.insv' })).toBe('clip.insv');
  });

  it('reads the name of a URL that does not parse, for the load to fail on later', () => {
    expect(inputName({ url: 'http://[::1/clips/x_10_.insv' })).toBe('x_10_.insv');
  });

  it('keeps a badly percent-encoded name as written', () => {
    expect(inputName({ url: 'https://cdn.example/bad%zz.insv' })).toBe('bad%zz.insv');
  });

  it('uses the blob input name and tells the two kinds apart', () => {
    const blob = { blob: new Blob(), name: 'local.insv' };
    expect(inputName(blob)).toBe('local.insv');
    expect(isUrlInput(blob)).toBe(false);
    expect(isUrlInput({ url: 'x' })).toBe(true);
  });
});
