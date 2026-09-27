import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

import { AUTOPLAY_WITHOUT_GESTURE, chromiumArguments } from '../../test/browserLaunch.mjs';

/**
 * The player is DOM code over WebCodecs and WebGL, so every test runs in real Chromium and
 * WebKit builds through Playwright. The autoplay flag lets Chromium start the audio clock
 * without a gesture; the tests exercise the player, not the policy.
 */
export default defineProject({
  server: {
    fs: { allow: ['../..'] },
  },
  test: {
    name: 'player',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          provider: playwright({
            launchOptions: { args: chromiumArguments(AUTOPLAY_WITHOUT_GESTURE) },
          }),
        },
        { browser: 'webkit' },
      ],
    },
  },
});
