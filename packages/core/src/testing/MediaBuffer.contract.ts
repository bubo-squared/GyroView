import { describe, expect, it } from 'vitest';

import type { MediaBuffer } from '../ports/MediaBuffer';

/**
 * A buffer under test, and a way to bring it more.
 */
export interface MediaBufferUnderTest {
  readonly buffer: MediaBuffer;
  readonly bringMore: () => Promise<void>;
}

/**
 * Behaviour every MediaBuffer must exhibit: its fake, the recording's and a file download's.
 */
export function describeMediaBufferContract(
  name: string,
  open: () => Promise<MediaBufferUnderTest>,
): void {
  describe(`MediaBuffer contract (${name})`, () => {
    it('tells its listener that more came, until it stops listening', async () => {
      const { buffer, bringMore } = await open();
      let progress = 0;
      const stop = buffer.onProgress(() => {
        progress += 1;
      });
      await bringMore();
      const heard = progress;
      stop();
      await bringMore();
      expect(heard).toBeGreaterThan(0);
      expect(progress).toBe(heard);
    });

    it('tells each of its listeners', async () => {
      const { buffer, bringMore } = await open();
      const heard = [0, 0];
      for (const index of [0, 1]) {
        buffer.onProgress(() => {
          heard[index] = (heard[index] ?? 0) + 1;
        });
      }
      await bringMore();
      expect(heard.every((count) => count > 0)).toBe(true);
    });
  });
}
