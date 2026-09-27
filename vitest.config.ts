import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

/**
 * The end-to-end browser tests play the local samples (git-ignored); without them, as on CI,
 * the project would start two browsers only to skip every test.
 */
const hasSamples = existsSync(new URL('samples', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/adapters/*/vitest.config.ts',
      'tools/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'apps/*/vitest.node.config.ts',
      ...(hasSamples ? ['tools/integration/vitest.browser.config.ts'] : []),
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
