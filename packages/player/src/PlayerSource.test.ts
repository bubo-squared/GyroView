import { describe, expect, it } from 'vitest';

import { inputName, isUrlInput } from './PlayerSource';

describe('inputName', () => {
  it('takes the file name of a URL', () => {
    expect(inputName({ url: 'https://cdn.example/clips/a%20clip.insv?x=1' })).toBe('a clip.insv');
  });

  it('uses the blob input name and tells the two kinds apart', () => {
    const blob = { blob: new Blob(), name: 'local.insv' };
    expect(inputName(blob)).toBe('local.insv');
    expect(isUrlInput(blob)).toBe(false);
    expect(isUrlInput({ url: 'x' })).toBe(true);
  });
});
