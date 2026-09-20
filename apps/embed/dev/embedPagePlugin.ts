import { readFile } from 'node:fs/promises';

import type { Plugin } from 'vite';

const EMBED_PAGE_PATH = '/embed.html';
const PLACEHOLDER_BASE = 'http://localhost';

/**
 * Test-server plugin: serves the embed page at `/embed.html`, transformed as Vite's own dev
 * server would, so browser tests can load it in an iframe from another origin. Vitest's
 * browser server otherwise answers only its runner pages.
 */
export function embedPagePlugin(pageFile: string): Plugin {
  return {
    name: 'gyroview-embed-page',
    configureServer(server): void {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? '/';
        if (new URL(requestUrl, PLACEHOLDER_BASE).pathname !== EMBED_PAGE_PATH) {
          next();
          return;
        }
        void readFile(pageFile, 'utf8')
          .then((html) => server.transformIndexHtml(requestUrl, html))
          .then((html) => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          })
          .catch(next);
      });
    },
  };
}
