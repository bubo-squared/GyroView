import { describe, expect, it } from 'vitest';

import { RecordingFileName } from './RecordingFileName';

describe('RecordingFileName', () => {
  it('reads the lens and proxy digits of a camera file name', () => {
    const name = RecordingFileName.parse('VID_20260814_132640_00_013.insv');
    expect(name).toMatchObject({ isBackLens: true, isScreenLens: false, isProxy: false });
    expect(name?.toString()).toBe('VID_20260814_132640_00_013.insv');
  });

  it('recognises the packed proxy the X5 writes beside its recording', () => {
    const name = RecordingFileName.parse('LRV_20260814_132640_01_013.lrv');
    expect(name).toMatchObject({ isBackLens: true, isProxy: true });
  });

  it('derives the other lens file of a split-file pair in both directions', () => {
    expect(RecordingFileName.parse('VID_20230101_090000_00_001.insv')?.otherLensName()).toBe(
      'VID_20230101_090000_10_001.insv',
    );
    expect(RecordingFileName.parse('VID_20230101_090000_10_001.insv')?.otherLensName()).toBe(
      'VID_20230101_090000_00_001.insv',
    );
  });

  it('accepts prefixes with underscores and rejects names outside the convention', () => {
    expect(RecordingFileName.parse('PRO_VID_20230101_090000_00_001.insv')?.toString()).toBe(
      'PRO_VID_20230101_090000_00_001.insv',
    );
    for (const name of [
      'clip.mp4',
      'VID_2023_090000_00_001.insv',
      'VID_20230101_090000_0_001.insv',
      '',
    ]) {
      expect(RecordingFileName.parse(name)).toBeUndefined();
    }
  });
});
