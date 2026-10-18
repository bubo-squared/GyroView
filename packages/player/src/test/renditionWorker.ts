import { openRendition } from '../rendition';

/**
 * A dedicated worker that renders the recording it is sent and answers with the count and size
 * of the frames, or the error's message: what a page encoding off the main thread does.
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
      globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
