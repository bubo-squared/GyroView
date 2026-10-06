import { describe, expect, it } from 'vitest';

import { isSamplesRequest } from './samplesWithheld';

const SAMPLES_ROOT = '/work/GyroView²/samples';

describe('isSamplesRequest', () => {
  it('names the listing and every file under the samples, the catalogue included', () => {
    expect(isSamplesRequest('/samples.json', SAMPLES_ROOT)).toBe(true);
    expect(isSamplesRequest('/@fs/work/GyroView²/samples/catalogue.json', SAMPLES_ROOT)).toBe(true);
    expect(isSamplesRequest('/@fs/work/GyroView²/samples/office/clip.insv', SAMPLES_ROOT)).toBe(
      true,
    );
  });

  it('sees through an encoded, dotted or differently cased spelling', () => {
    expect(isSamplesRequest('/@fs/work/GyroView%C2%B2/samples/catalogue.json', SAMPLES_ROOT)).toBe(
      true,
    );
    expect(isSamplesRequest('/@fs/work/GyroView²/apps/../samples/a.insv', SAMPLES_ROOT)).toBe(true);
    expect(isSamplesRequest('/@fs/WORK/gyroview²/SAMPLES/a.insv?import', SAMPLES_ROOT)).toBe(true);
  });

  it('leaves the rest of the repository and the page alone', () => {
    expect(isSamplesRequest('/', SAMPLES_ROOT)).toBe(false);
    expect(isSamplesRequest('/src/pages/developmentMain.ts', SAMPLES_ROOT)).toBe(false);
    expect(isSamplesRequest('/@fs/work/GyroView²/packages/core/src/index.ts', SAMPLES_ROOT)).toBe(
      false,
    );
    expect(isSamplesRequest('/@fs/work/GyroView²/samples-notes.md', SAMPLES_ROOT)).toBe(false);
  });
});
