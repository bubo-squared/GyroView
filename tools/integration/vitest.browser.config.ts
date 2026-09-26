import { browserProject } from './browserProject';

/**
 * The end-to-end regression tests over the real recordings, part of every test run.
 */
export default browserProject({
  name: 'integration-browser',
  include: ['src/browser/**/*.test.ts'],
  savesArtifacts: false,
});
