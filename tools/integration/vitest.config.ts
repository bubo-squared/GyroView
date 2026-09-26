import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'integration',
    include: ['src/**/*.test.ts'],
    exclude: ['src/browser/**', 'src/measure/**'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
