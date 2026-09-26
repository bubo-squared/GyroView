import { describe, expect, it } from 'vitest';

import { sampleRecordingsOf } from './sampleRecordings';

describe('sampleRecordingsOf', () => {
  it('offers the recordings and skips proxies and other files', () => {
    const recordings = sampleRecordingsOf([
      {
        folder: 'office',
        files: [
          { name: 'LRV_20260814_132640_01_013.lrv', url: '/@fs/o/LRV_20260814_132640_01_013.lrv' },
          {
            name: 'VID_20260814_132640_00_013.insv',
            url: '/@fs/o/VID_20260814_132640_00_013.insv',
          },
          {
            name: 'VID_20260814_132640_11_013.insv',
            url: '/@fs/o/VID_20260814_132640_11_013.insv',
          },
          { name: 'notes.txt', url: '/@fs/o/notes.txt' },
        ],
      },
      { folder: 'loose', files: [{ name: 'clip.insv', url: '/@fs/l/clip.insv' }] },
    ]);
    expect(recordings).toEqual([
      {
        label: 'office/VID_20260814_132640_00_013.insv',
        url: '/@fs/o/VID_20260814_132640_00_013.insv',
      },
      { label: 'loose/clip.insv', url: '/@fs/l/clip.insv' },
    ]);
  });
});
