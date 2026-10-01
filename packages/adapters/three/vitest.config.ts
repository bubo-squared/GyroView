import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

import { chromiumArguments } from '../../../test/browserLaunch.mjs';

/**
 * WebGL and VideoFrame uploads exist only in browsers, so this project runs in real Chromium
 * and WebKit builds through Playwright, like the other browser adapters.
 *
 * On the Linux CI runners Chromium draws in software, and this project's files share one
 * Chromium and so one GPU process: a test's draws and read-backs wait behind the seam meter's
 * long passes in a file running beside it. A rendering test that takes 0.3 s alone has taken
 * 17 s there, so a test may take 30 s, as the player's may.
 */
export default defineProject({
  test: {
    name: 'adapter-three',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          provider: playwright({ launchOptions: { args: chromiumArguments() } }),
        },
        { browser: 'webkit' },
      ],
    },
  },
});
