import { browserProject } from './browserProject.ts';

/**
 * The end-to-end regression tests over the real recordings, part of every test run on a machine
 * that has the samples (the root configuration leaves them out otherwise).
 */
export default browserProject({
  name: 'integration-browser',
  include: ['src/browser/**/*.test.ts'],
  savesArtifacts: false,
});
