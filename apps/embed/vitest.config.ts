import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

/**
 * The bridge drives a real `<gyro-view>`, so the tests run in Chromium and WebKit like the
 * player's own.
 */
export default defineProject({
  server: {
    fs: { allow: ['../..'] },
  },
  test: {
    name: 'embed',
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
            launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
          }),
        },
        { browser: 'webkit' },
      ],
    },
  },
});
