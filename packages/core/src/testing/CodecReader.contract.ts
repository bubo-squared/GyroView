import { describe, expect, it } from 'vitest';

import type { TrackColour } from '../domain/colour/TrackColour';
import type { CodecReader } from '../ports/CodecReader';

/**
 * A codec reader under test with the movie bytes of a file whose tracks are known, and bytes
 * that are no movie.
 */
export interface CodecReaderUnderTest {
  readonly reader: CodecReader;
  readonly movieBytes: Uint8Array;
  readonly videoTrackIds: readonly number[];
  /**
   * How each video track's bitstream says its samples encode colour, in track order.
   */
  readonly videoColours: readonly TrackColour[];
  readonly audioTrackIds: readonly number[];
  readonly notMovie: Uint8Array;
}

/**
 * Behaviour every CodecReader must exhibit, the fake and the real adapter alike.
 */
export function describeCodecReaderContract(setup: () => Promise<CodecReaderUnderTest>): void {
  describe('CodecReader contract', () => {
    it('tells the codec of every track of picture and sound, by the id of its track', async () => {
      const subject = await setup();
      const codecs = await subject.reader.read(subject.movieBytes);
      expect(codecs.video.map((codec) => codec.trackId)).toEqual(subject.videoTrackIds);
      expect(codecs.audio.map((codec) => codec.trackId)).toEqual(subject.audioTrackIds);
    });

    it('numbers the video tracks in the order the file lists them', async () => {
      const subject = await setup();
      const { video } = await subject.reader.read(subject.movieBytes);
      expect(video.map((codec) => codec.description.trackIndex)).toEqual([...video.keys()]);
    });

    it('describes each video track with the codec and the size its decoder is configured for', async () => {
      const subject = await setup();
      const { video } = await subject.reader.read(subject.movieBytes);
      for (const { description, configuration } of video) {
        expect(configuration.codec).toBe(description.codec);
        expect(configuration.codedWidth).toBe(description.codedWidth);
        expect(configuration.codedHeight).toBe(description.codedHeight);
      }
    });

    it("describes each video track's colour as its bitstream says", async () => {
      const subject = await setup();
      const { video } = await subject.reader.read(subject.movieBytes);
      expect(video.map((codec) => codec.description.colour)).toEqual(subject.videoColours);
    });

    it('configures each audio track with its rate and channels', async () => {
      const subject = await setup();
      const { audio } = await subject.reader.read(subject.movieBytes);
      for (const { configuration } of audio) {
        expect(configuration.sampleRate).toBeGreaterThan(0);
        expect(configuration.numberOfChannels).toBeGreaterThan(0);
      }
    });

    it('rejects bytes that are no movie with unsupported-container', async () => {
      const subject = await setup();
      await expect(subject.reader.read(subject.notMovie)).rejects.toMatchObject({
        code: 'unsupported-container',
      });
    });
  });
}
