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
  it('inspects a recording on disk and names the file it read', async () => {
    const inspection = await inspectFile(SYNTHETIC_X5);
    expect(inspection).toMatchObject({ file: SYNTHETIC_X5, gyro: { samples: 2000 } });
  });
});
