import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-node',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
