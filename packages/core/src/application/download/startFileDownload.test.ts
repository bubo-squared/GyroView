import { describe, expect, it } from 'vitest';

import { SourceByteStream } from './SourceByteStream';
import { startFileDownload } from './startFileDownload';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import type { AudioTrackCodec, ContainerCodecs, VideoTrackCodec } from '../../ports/CodecReader';
import { seconds } from '../../shared/units/time';
import { cameraRecording } from '../../testing/cameraRecording';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';

const RECORDING = cameraRecording({
  frames: 30,
  frameBytes: 40,
  soundBytes: 8,
  frameRate: 10,
  framesPerGop: 10,
});
const POLICY: DownloadPolicy = {
  aheadSeconds: seconds(1),
  aheadBytes: 10_000,
  keepBehindBytes: 1000,
  keepBehindSeconds: seconds(2),
  requestSize: 500,
  requestsInFlight: 2,
  bridgedGap: 100,
  refillBytes: 1000,
  resumeSeconds: seconds(1),
};

function lensCodec(trackId: number, trackIndex: number): VideoTrackCodec {
  const size = { codedWidth: 64, codedHeight: 64 };
  return {
    trackId,
    description: { trackIndex, codec: 'avc1.64000a', ...size },
    configuration: { codec: 'avc1.64000a', ...size, description: undefined, isFullRange: false },
  };
}

const SOUND_CODEC: AudioTrackCodec = {
  trackId: RECORDING.sound.trackId,
  configuration: {
    codec: 'mp4a.40.2',
    sampleRate: 48_000,
    numberOfChannels: 2,
    description: undefined,
  },
};

function started(codecs: ContainerCodecs): ReturnType<typeof startFileDownload> {
  const stream = new SourceByteStream(
    new InMemoryRandomAccessSource(new Uint8Array(RECORDING.fileSize)),
  );
  return startFileDownload({ table: RECORDING.table, stream, codecs, policy: POLICY });
}

describe('startFileDownload', () => {
  it('reads each video track the codec reader told of, by its track id, in its order', async () => {
    const codecs: ContainerCodecs = {
      video: [lensCodec(RECORDING.lens1.trackId, 0), lensCodec(RECORDING.lens0.trackId, 1)],
      audio: [SOUND_CODEC],
    };
    const file = started(codecs);
    expect(file.videoTracks.map((track) => track.description.trackIndex)).toEqual([0, 1]);
    await expect(file.videoTracks[0]?.frameCount()).resolves.toBe(RECORDING.lens1.sampleCount);
    expect(file.audioTracks.map((track) => track.configuration)).toEqual([
      SOUND_CODEC.configuration,
    ]);
    expect(file.duration).toBe(RECORDING.duration);
    file.dispose();
  });

  it('reads each sound track the codec reader told of', async () => {
    const file = started({ video: [], audio: [SOUND_CODEC] });
    file.download.startReadingAhead();
    const samples = file.audioTracks[0]?.samples.samplesFrom(seconds(0)) ?? [];
    const [first] = await Array.fromAsync(samples);
    expect(first?.data.byteLength).toBe(RECORDING.sound.rangeOf(0).length);
    file.dispose();
  });

  it('refuses a codec for a track the sample table does not have', () => {
    const codecs: ContainerCodecs = { video: [lensCodec(99, 0)], audio: [] };
    expect(() => started(codecs)).toThrow(
      expect.objectContaining({
        code: 'unsupported-container',
        message: 'the movie box has no video track 99 to read',
      }) as Error,
    );
  });

  it('ends every read once disposed', async () => {
    const file = started({ video: [lensCodec(RECORDING.lens0.trackId, 0)], audio: [] });
    const packets = file.videoTracks[0]?.packetsFrom(seconds(0))[Symbol.asyncIterator]();
    file.dispose();
    await expect(packets?.next()).resolves.toMatchObject({ done: true });
  });
});
