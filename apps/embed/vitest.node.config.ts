import { defineProject } from 'vitest/config';

/**
 * The dev-server helpers read the file system, so they are tested in Node.
 */
export default defineProject({
  test: {
    name: 'embed-dev',
    include: ['dev/**/*.test.ts'],
    environment: 'node',
  },
});
