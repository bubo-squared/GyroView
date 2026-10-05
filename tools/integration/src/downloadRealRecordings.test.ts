import { MediabunnyAudioPackager, MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { detectLensLayout, readRecording, seconds } from '@gyroview/core';
import { openDownloadedSource } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { hasSamples, OFFICE_RECORDING, SAILING_RECORDING } from './samples';

describe.skipIf(!hasSamples())('reading the real X5 recordings through the download', () => {
  it('opens the office file: two 2880x2880 HEVC tracks at 59.94 fps with out-of-band parameter sets', async () => {
    const source = await FileRandomAccessSource.open(OFFICE_RECORDING);
    const input = await openDownloadedSource(source, new MediabunnyCodecReader());
    try {
      expect(input.duration).toBeCloseTo(262.095, 2);
      expect(input.videoTracks.map((track) => track.description)).toMatchObject([
        { trackIndex: 0, codedWidth: 2880, codedHeight: 2880 },
        { trackIndex: 1, codedWidth: 2880, codedHeight: 2880 },
      ]);
      expect(input.videoTracks[0]!.description.codec).toMatch(/^hev1|^hvc1/);
      expect(input.videoTracks[0]!.description.colour).toEqual({
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        range: 'full',
      });
      expect(input.audioTracks).toHaveLength(1);
      const [sound] = input.audioTracks;
      const segments =
        sound && new MediabunnyAudioPackager().segmentsOf(sound.samples, sound.configuration);
      expect(segments?.mimeType).toMatch(/^audio\/mp4; codecs="mp4a/);
      expect(segments?.duration).toBeCloseTo(262, 0);

      const configuration = await input.videoTracks[0]!.decoderConfiguration();
      expect(configuration.colour.range).toBe('full');
      expect(configuration.description?.byteLength).toBeGreaterThan(100);

      const key = await input.videoTracks[0]!.keyframeAt(seconds(100));
      expect(key?.timestamp).toBeCloseTo(98.098, 3);
      await expect(input.videoTracks[0]!.frameCount()).resolves.toBe(15_710);
    } finally {
      input.dispose();
      await source.close();
    }
  });

  it('feeds the lens layout detector with the tracks of the sailing file', async () => {
    const source = await FileRandomAccessSource.open(SAILING_RECORDING);
    const input = await openDownloadedSource(source, new MediabunnyCodecReader());
    try {
      const recording = await readRecording(source);
      const tracks = {
        name: SAILING_RECORDING,
        videoTracks: input.videoTracks,
        hasTrailer: true,
      };
      const layout = detectLensLayout([tracks], recording.info);
      expect(layout.kind).toBe('multi-track');
      const isSwapped = recording.info.trackOrder === 'stream-10-first';
      const expectedMapping = isSwapped
        ? [
            [0, 1],
            [1, 0],
          ]
        : [
            [0, 0],
            [1, 1],
          ];
      expect(layout.sources.map((lens) => [lens.lensIndex, lens.trackIndex])).toEqual(
        expectedMapping,
      );
      expect(layout.evidence.some((line) => line.includes('track order'))).toBe(true);
    } finally {
      input.dispose();
      await source.close();
    }
  });
});
