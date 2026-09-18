import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapter-mediabunny',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
