import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

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
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          provider: playwright({
            launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
          }),
        },
        { browser: 'webkit' },
      ],
    },
  },
});
