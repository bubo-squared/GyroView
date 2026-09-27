import { seconds, type AudioSegmentSource } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import {
  attachMediaSource,
  isMediaSourceTypeSupported,
  mediaSourceConstructor,
  type AttachedMediaSource,
} from './mediaSourceSupport';
import { SourceBufferFeeder } from './SourceBufferFeeder';

const AAC_IN_MP4 = 'audio/mp4; codecs="mp4a.40.2"';

/**
 * A source the test never reads: the feeder under test is disposed before any run starts.
 */
const UNREAD_SOURCE: AudioSegmentSource = {
  mimeType: AAC_IN_MP4,
  duration: seconds(3),
  async *segmentsFrom(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    // Nothing to append.
  },
};

async function openMediaSource(element: HTMLMediaElement): Promise<AttachedMediaSource> {
  const mediaSourceClass = mediaSourceConstructor();
  if (!mediaSourceClass) throw new Error('this browser has no media source');
  return attachMediaSource(element, mediaSourceClass);
}

describe.skipIf(!isMediaSourceTypeSupported(AAC_IN_MP4))('SourceBufferFeeder', () => {
  it('disposes while old audio is being evicted, which a source buffer cannot abort', async () => {
    const element = document.createElement('audio');
    document.body.append(element);
    const attached = await openMediaSource(element);
    const { mediaSource } = attached;
    const sourceBuffer = mediaSource.addSourceBuffer(AAC_IN_MP4);
    mediaSource.duration = UNREAD_SOURCE.duration;
    const feeder = new SourceBufferFeeder({
      element,
      mediaSource,
      sourceBuffer,
      source: UNREAD_SOURCE,
    });
    sourceBuffer.remove(0, 1);
    expect(sourceBuffer.updating).toBe(true);
    expect(() => {
      feeder.dispose();
    }).not.toThrow();
    attached.detach();
    element.remove();
  });
});
