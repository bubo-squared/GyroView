import { browserProject } from './browserProject';

/**
 * On request only (`pnpm measure`): the end-to-end tests writing their renders to `.artifacts/`
 * for inspection, and the measurements that decide a camera's constants, such as the IMU frame
 * ranking of ADR 0009, too slow to repeat on every run.
 */
export default browserProject({
  name: 'integration-measure',
  include: ['src/browser/**/*.test.ts', 'src/measure/**/*.test.ts'],
  savesArtifacts: true,
});
