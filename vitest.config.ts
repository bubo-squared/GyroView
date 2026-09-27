import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

/**
 * The end-to-end browser tests play the local samples (git-ignored); without them, as on CI,
 * the project would start two browsers only to skip every test.
 */
const hasSamples = existsSync(new URL('samples', import.meta.url));

/**
 * Each browser instance of each project adds a SIGTERM listener to this process, to close its
 * browser: a dozen are expected, and Node warns of a leak past ten.
 */
const EXPECTED_SIGTERM_LISTENERS = 32;
process.setMaxListeners(EXPECTED_SIGTERM_LISTENERS);

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
    // Istanbul instruments the code itself, so it counts in WebKit as in Chromium and Node; v8
    // coverage exists in Chromium only and refuses a run with several browsers.
    coverage: {
      provider: 'istanbul',
      include: ['packages/**/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.contract.ts',
        '**/index.ts',
        '**/test/**',
        '**/testing/**',
        '**/*.d.ts',
      ],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
