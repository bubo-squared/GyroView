import { defineProject } from 'vitest/config';

/**
 * `Blob` is a web standard Node implements too, so the contract runs in Node like the other
 * source adapters; the player's browser tests cover it over real `File`s.
 */
export default defineProject({
  test: {
    name: 'adapter-blob',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
