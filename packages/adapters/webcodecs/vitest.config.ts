import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

import { chromiumArguments } from '../../../test/browserLaunch.mjs';

/**
 * WebCodecs exists only in browsers, so this project runs its tests in real Chromium and WebKit
 * builds through Playwright. Software H.264 decoding suffices for the synthetic fixture.
 */
export default defineProject({
  server: {
    fs: { allow: ['../../..'] },
  },
  test: {
    name: 'adapter-webcodecs',
    include: ['src/**/*.test.ts'],
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
