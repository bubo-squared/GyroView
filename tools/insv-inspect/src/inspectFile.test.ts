import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { inspectFile } from './inspectFile';

const SYNTHETIC_X5 = fileURLToPath(
  new URL(
    '../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4',
    import.meta.url,
  ),
);

describe('inspectFile', () => {
  it('summarises the gyro and exposure records of a recording on disk', async () => {
    const inspection = await inspectFile(SYNTHETIC_X5);
    expect(inspection.gyro).toMatchObject({
      layout: 'raw',
      samples: 2000,
      damagedSamples: 0,
      mendedStamps: 0,
    });
    expect(inspection.exposure).toMatchObject({ entries: 16 });
  });
});
