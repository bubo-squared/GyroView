import { inject } from 'vitest';

import type { ServedLocalSample } from '../localSampleCatalogue';
import type { SampleRecording } from './sampleUrls';

/**
 * A recording only this machine has, as the tests open it.
 */
export interface LocalSample extends ServedLocalSample {
  readonly sample: SampleRecording;
}

/**
 * The local samples of `samples/catalogue.json`, none without it (as in CI).
 */
export const LOCAL_SAMPLES: readonly LocalSample[] = inject('localSamples').map((entry) => ({
  ...entry,
  sample: {
    name: entry.name,
    url: entry.url,
    frameRate: entry.frameRate,
    codedSize: entry.codedSize,
  },
}));
