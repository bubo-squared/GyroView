import { describe, expect, it } from 'vitest';

import { parseLocalCatalogue } from './localSampleCatalogue';

/**
 * An invented entry: the catalogue's real entries never enter the repository (ADR 0031).
 */
const ENTRY = {
  slug: 'invented',
  name: 'An invented camera',
  folder: 'invented samples',
  recording: 'recording.insv',
  frameRate: 25,
  codedSize: 1024,
  renderMoment: 2,
  imuRankingTimes: [1, 2, 3],
  privateTokens: ['recording', 'SERIAL'],
};

const STUDIO = { start: 0.5, frameTimes: [1, 2], comparedTimes: [2], steadinessStart: 1.5 };

describe('parseLocalCatalogue', () => {
  it('reads an entry field by field, its mounting and Studio clip only when it has them', () => {
    expect(parseLocalCatalogue({ samples: [ENTRY] })).toEqual([ENTRY]);
    expect(parseLocalCatalogue({ samples: [{ ...ENTRY, mounting: 'upright' }] })).toEqual([
      { ...ENTRY, mounting: 'upright' },
    ]);
    expect(parseLocalCatalogue({ samples: [{ ...ENTRY, studio: STUDIO }] })).toEqual([
      { ...ENTRY, studio: STUDIO },
    ]);
    const withSdr = { ...STUDIO, sdrFrameTimes: [2] };
    expect(parseLocalCatalogue({ samples: [{ ...ENTRY, studio: withSdr }] })).toEqual([
      { ...ENTRY, studio: withSdr },
    ]);
  });

  it('refuses a catalogue without a list of samples', () => {
    expect(() => parseLocalCatalogue(null)).toThrow('the catalogue is no object');
    expect(() => parseLocalCatalogue({ samples: ENTRY })).toThrow('no list of samples');
  });

  it('names the field that is missing or of the wrong kind', () => {
    expect(() => parseLocalCatalogue({ samples: [{ ...ENTRY, slug: undefined }] })).toThrow(
      'slug is no string',
    );
    expect(() => parseLocalCatalogue({ samples: [{ ...ENTRY, frameRate: '25' }] })).toThrow(
      'frameRate is no number',
    );
    expect(() => parseLocalCatalogue({ samples: [{ ...ENTRY, imuRankingTimes: 1 }] })).toThrow(
      'imuRankingTimes is no list',
    );
    expect(() => parseLocalCatalogue({ samples: [{ ...ENTRY, mounting: 1 }] })).toThrow(
      'mounting is no string',
    );
    expect(() => parseLocalCatalogue({ samples: [{ ...ENTRY, privateTokens: [1] }] })).toThrow(
      'privateTokens is no list',
    );
    expect(() =>
      parseLocalCatalogue({ samples: [{ ...ENTRY, studio: { ...STUDIO, start: null } }] }),
    ).toThrow('start is no number');
  });
});
