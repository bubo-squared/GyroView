import { GyroViewError, messageOf } from '@gyroview/core';

import { openRendition } from '../rendition';

/**
 * The error's code, which the test skips on where the browser lacks what the rendition needs.
 */
function codeOf(error: unknown): string | undefined {
  return error instanceof GyroViewError ? error.code : undefined;
}

/**
 * A dedicated worker that renders the recording it is sent and answers with the count and size
 * of the frames, or the error's message and code: what a page encoding off the main thread does.
 */
globalThis.addEventListener('message', (event: MessageEvent<{ url: string; width: number }>) => {
  void (async (): Promise<void> => {
    try {
      const rendition = await openRendition(
        { main: { url: event.data.url } },
        {
          width: event.data.width,
        },
      );
      let count = 0;
      let size = { width: 0, height: 0 };
      for await (const frame of rendition.frames()) {
        size = { width: frame.displayWidth, height: frame.displayHeight };
        frame.close();
        count += 1;
      }
      globalThis.postMessage({ count, size });
    } catch (error) {
      globalThis.postMessage({ error: messageOf(error), code: codeOf(error) });
    }
  })();
});
