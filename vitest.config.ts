import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/adapters/*/vitest.config.ts',
      'tools/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'apps/*/vitest.node.config.ts',
      'tools/integration/vitest.browser.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
