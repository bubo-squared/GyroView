import { defineProject } from 'vitest/config';

/**
 * The package's manifest checks read files, so they run in Node.
 */
export default defineProject({
  test: {
    name: 'library',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
