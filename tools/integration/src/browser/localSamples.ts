import { inject } from 'vitest';

import type { ServedLocalSample } from '../localSampleCatalogue';

/**
 * The local samples of `samples/catalogue.json`, none without it (as in CI). Each is a
 * `SampleRecording` the tests open like the committed ones.
 */
export const LOCAL_SAMPLES: readonly ServedLocalSample[] = inject('localSamples');
