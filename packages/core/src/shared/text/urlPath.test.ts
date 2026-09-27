import { describe, expect, it } from 'vitest';

import { fileNameOfUrl, splitUrl } from './urlPath';

describe('fileNameOfUrl', () => {
  it('takes the decoded last path segment, ignoring the query and the fragment', () => {
    expect(fileNameOfUrl('https://cdn.example/clips/VID_20260814_132640_00_013.insv?x=1')).toBe(
      'VID_20260814_132640_00_013.insv',
    );
    expect(fileNameOfUrl('https://cdn.example/a%20clip.insv#t=3')).toBe('a clip.insv');
  });

  it('reads relative URLs and ones a URL parser refuses', () => {
    expect(fileNameOfUrl('media/clip.insv')).toBe('clip.insv');
    expect(fileNameOfUrl('http://[::1/clips/x_10_.insv')).toBe('x_10_.insv');
  });

  it('keeps a badly percent-encoded name as written', () => {
    expect(fileNameOfUrl('https://cdn.example/bad%zz.insv')).toBe('bad%zz.insv');
  });
});

describe('splitUrl', () => {
  it('keeps the query and fragment apart from the path', () => {
    expect(splitUrl('a/b.insv?x=1#y')).toEqual({ path: 'a/b.insv', suffix: '?x=1#y' });
    expect(splitUrl('a/b.insv')).toEqual({ path: 'a/b.insv', suffix: '' });
  });
});
