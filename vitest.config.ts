import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'packages/adapters/*', 'tools/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts', 'tools/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
