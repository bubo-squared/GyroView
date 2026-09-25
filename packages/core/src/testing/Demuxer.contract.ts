import { describe, expect, it } from 'vitest';

import type { Demuxer } from '../ports/Demuxer';
import type { RandomAccessSource } from '../ports/RandomAccessSource';

/**
 * A demuxer under test with a media file whose tracks are known and bytes that are no media file.
 */
export interface DemuxerUnderTest {
  readonly demuxer: Demuxer;
  readonly media: RandomAccessSource;
  readonly videoTrackCount: number;
  readonly audioTrackCount: number;
  readonly notMedia: RandomAccessSource;
}

const MEDIA_NAME = 'clip.mp4';
const NOT_MEDIA_NAME = 'noise.bin';

/**
 * Behaviour every Demuxer must exhibit, the fake and the real adapter alike.
 */
export function describeDemuxerContract(setup: () => Promise<DemuxerUnderTest>): void {
  describe('Demuxer contract', () => {
    it('opens a media file under the name given, with its tracks and a duration', async () => {
      const subject = await setup();
      const input = await subject.demuxer.open(subject.media, MEDIA_NAME);
      expect(input.name).toBe(MEDIA_NAME);
      expect(input.videoTracks).toHaveLength(subject.videoTrackCount);
      expect(input.audioTracks).toHaveLength(subject.audioTrackCount);
      expect(input.duration).toBeGreaterThan(0);
      input.dispose();
    });

    it('numbers the video tracks in the order the file lists them', async () => {
      const subject = await setup();
      const input = await subject.demuxer.open(subject.media, MEDIA_NAME);
      const indices = input.videoTracks.map((track) => track.description.trackIndex);
      expect(indices).toEqual([...indices.keys()]);
      input.dispose();
    });

    it('rejects bytes that are no media file with unsupported-container, naming them', async () => {
      const subject = await setup();
      await expect(subject.demuxer.open(subject.notMedia, NOT_MEDIA_NAME)).rejects.toMatchObject({
        code: 'unsupported-container',
        message: expect.stringContaining(NOT_MEDIA_NAME) as string,
      });
    });
  });
}
