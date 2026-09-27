import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

import { chromiumArguments } from '../../../test/browserLaunch.mjs';

/**
 * WebGL and VideoFrame uploads exist only in browsers, so this project runs in real Chromium
 * and WebKit builds through Playwright, like the other browser adapters.
 */
export default defineProject({
  test: {
    name: 'adapter-three',
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
