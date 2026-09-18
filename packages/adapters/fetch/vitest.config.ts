import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-fetch',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
