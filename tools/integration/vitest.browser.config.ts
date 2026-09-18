import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAMPLE_FOLDERS = ['office', 'sailing'].map((name) =>
  fileURLToPath(new URL(`../../samples/${name}`, import.meta.url)),
);

/**
 * `samples/*` are symlinks to folders outside the repository; Vite serves a file only when its
 * real path is allowed, so the targets that exist are added explicitly.
 */
const sampleTargets = SAMPLE_FOLDERS.filter((folder) => existsSync(folder)).map((folder) =>
  realpathSync(folder),
);

/**
 * Playwright's own Chromium build has no HEVC decoder; the installed Google Chrome does. The
 * end-to-end tests drive Chrome when it is present and fall back to Chromium (where the
 * HEVC-dependent tests skip themselves).
 */
const CHROME_APP = '/Applications/Google Chrome.app';
const chromiumLaunch = {
  args: ['--autoplay-policy=no-user-gesture-required'],
  ...(existsSync(CHROME_APP) && { channel: 'chrome' }),
};

/**
 * End-to-end tests of the browser pipeline (HTTP ranges, demuxing, WebCodecs, the audio clock)
 * against the real recordings, served by Vite's dev server with Range support. Skipped inside
 * the tests when the samples are absent, as in CI.
 */
export default defineProject({
  server: {
    fs: { allow: [REPOSITORY_ROOT, ...sampleTargets] },
  },
  test: {
    name: 'integration-browser',
    include: ['src/browser/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          provider: playwright({ launchOptions: chromiumLaunch }),
        },
        { browser: 'webkit' },
      ],
    },
  },
});
