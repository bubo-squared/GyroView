import { describe, expect, it } from 'vitest';

import { locateOtherLensFile } from './locateOtherLensFile';
import { FakeResourceLocator } from '../../testing/FakeResourceLocator';

const RECORDING = 'https://cdn.example.com/clips/VID_20260814_132640_00_013.insv';
const OTHER_LENS = 'https://cdn.example.com/clips/VID_20260814_132640_10_013.insv';

describe('locateOtherLensFile', () => {
  it('finds the _10_ file next to a _00_ recording', async () => {
    const locator = new FakeResourceLocator([OTHER_LENS]);
    await expect(locateOtherLensFile(RECORDING, locator)).resolves.toBe(OTHER_LENS);
    expect(locator.asked).toEqual([OTHER_LENS]);
  });

  it('returns undefined for a one-file recording whose server has no _10_ file', async () => {
    const locator = new FakeResourceLocator([]);
    await expect(locateOtherLensFile(RECORDING, locator)).resolves.toBeUndefined();
    expect(locator.asked).toEqual([OTHER_LENS]);
  });

  it('asks nothing for a URL whose file name is not a camera name', async () => {
    const locator = new FakeResourceLocator([OTHER_LENS]);
    await expect(
      locateOtherLensFile('https://cdn.example.com/clip.mp4', locator),
    ).resolves.toBeUndefined();
    expect(locator.asked).toEqual([]);
  });

  it('keeps the query string and decodes an encoded file name', async () => {
    const signed = 'https://cdn.example.com/a%20b/VID_20260814_132640_00_013.insv?token=1#t=2';
    const expected = 'https://cdn.example.com/a%20b/VID_20260814_132640_10_013.insv?token=1#t=2';
    const locator = new FakeResourceLocator([expected]);
    await expect(locateOtherLensFile(signed, locator)).resolves.toBe(expected);
  });

  it('works on a bare file name without any slash', async () => {
    const locator = new FakeResourceLocator(['VID_20260814_132640_10_013.insv']);
    await expect(locateOtherLensFile('VID_20260814_132640_00_013.insv', locator)).resolves.toBe(
      'VID_20260814_132640_10_013.insv',
    );
  });
});
