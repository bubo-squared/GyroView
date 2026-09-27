import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

import { AUTOPLAY_WITHOUT_GESTURE, chromiumArguments } from '../../../test/browserLaunch.mjs';

/**
 * Media Source Extensions and audio elements exist only in browsers, so this project runs in
 * real Chromium and WebKit builds through Playwright, like the WebCodecs adapter. Headless
 * Chromium applies its autoplay policy to `play()` without a gesture; the flag lifts it for the
 * tests, which exercise the clock, not the policy.
 */
export default defineProject({
  server: {
    fs: { allow: ['../../..'] },
  },
  test: {
    name: 'adapter-mse-audio',
    include: ['src/**/*.test.ts'],
    /**
     * The tests wait on real audio playback, which headless WebKit does not start at all while
     * the workspace's other browser suites saturate the machine; this project therefore runs
     * in its own group, after them.
     */
    sequence: { groupOrder: 1 },
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
