import { existsSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ARTIFACTS = path.join(REPOSITORY_ROOT, '.artifacts');
const DATA_URL_PAYLOAD = /^data:[^,]*;base64,(?<payload>.+)$/su;

/**
 * Browser command: stores a rendered image from a test for visual inspection. `.artifacts/` is
 * git-ignored.
 */
async function saveArtifact(_context: unknown, name: string, dataUrl: string): Promise<string> {
  const payload = DATA_URL_PAYLOAD.exec(dataUrl)?.groups?.['payload'];
  if (payload === undefined) throw new Error('saveArtifact expects a base64 data URL');
  await mkdir(ARTIFACTS, { recursive: true });
  const target = path.join(ARTIFACTS, path.basename(name));
  await writeFile(target, Buffer.from(payload, 'base64'));
  return target;
}
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
    /**
     * The suites share the machine's few hardware HEVC decoders; running them at once starves
     * the playback test of frames.
     */
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      commands: { saveArtifact },
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
