import { describe, expect, it } from 'vitest';

import { inspectRecording } from './inspectRecording';
import { fetchBytes, X5_RECORDING_URL } from './test/recordings';

describe('inspectRecording', () => {
  it('inspects a recording at a URL, read in byte ranges', async () => {
    const inspection = await inspectRecording(X5_RECORDING_URL);
    expect(inspection).toMatchObject({
      info: { model: 'Insta360 X5' },
      gyro: { layout: 'raw', samples: 2000 },
      exposure: { entries: 16 },
    });
  });

  it('inspects a file picked from disk alike', async () => {
    const bytes = await fetchBytes(X5_RECORDING_URL);
    const file = new File([bytes], 'VID_20260814_132640_00_013.insv');
    const inspection = await inspectRecording(file);
    expect(inspection.fileSize).toBe(bytes.byteLength);
    expect(inspection.gyro).toMatchObject({ samples: 2000 });
  });

  it('rejects a file that is no recording with the error a load would meet', async () => {
    const plain = new Blob([new Uint8Array(4096)]);
    await expect(inspectRecording(plain)).rejects.toMatchObject({ code: 'invalid-trailer' });
  });
});
