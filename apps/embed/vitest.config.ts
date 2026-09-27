import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineProject } from 'vitest/config';

import { AUTOPLAY_WITHOUT_GESTURE, chromiumArguments } from '../../test/browserLaunch.mjs';

import { embedPagePlugin } from './dev/embedPagePlugin.ts';

const EMBED_PAGE = fileURLToPath(new URL('embed.html', import.meta.url));

/**
 * Browser command: routes every request for `https://<hostName>/...` to this test server, which
 * gives the tests a second origin (the browser judges origins by host name) served with the
 * same files. It is answered as https because WebCodecs exists only in secure contexts, and
 * the interception happens before any connection, so no certificate is involved.
 */
const serveOtherOrigin: BrowserCommand<[hostName: string]> = async (context, hostName) => {
  const serverOrigin = new URL(context.page.url()).origin;
  await context.context.route(`https://${hostName}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const response = await route.fetch({
      url: `${serverOrigin}${requested.pathname}${requested.search}`,
    });
    await route.fulfill({ response });
  });
};

/**
 * The bridge drives a real `<gyro-view>`, so the tests run in Chromium and WebKit like the
 * player's own.
 */
export default defineProject({
  plugins: [embedPagePlugin(EMBED_PAGE)],
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
      commands: { serveOtherOrigin },
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
