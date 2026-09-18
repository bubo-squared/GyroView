// Opens an .insv over HTTP with mediabunny and describes what it finds.
import { ALL_FORMATS, Input, UrlSource, type InputVideoTrack } from 'mediabunny';

export interface OpenedRecording {
  input: Input;
  formatName: string;
  duration: number;
  videoTracks: InputVideoTrack[];
  audioTrackCount: number;
}

export async function openRecording(url: string): Promise<OpenedRecording> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  const format = await input.getFormat();
  const videoTracks = await input.getVideoTracks();
  const audioTracks = await input.getAudioTracks();
  const duration = await input.computeDuration();
  return { input, formatName: format.name, duration, videoTracks, audioTrackCount: audioTracks.length };
}

export interface TrackDescription {
  id: number;
  codec: string | null;
  codecString: string | null;
  codedWidth: number;
  codedHeight: number;
  averageFps: number;
  decoderConfig: VideoDecoderConfig | null;
  canDecode: boolean;
}

export async function describeTrack(track: InputVideoTrack): Promise<TrackDescription> {
  const frameRate = await track.computeFrameRateMetrics();
  const decoderConfig = await track.getDecoderConfig();
  return {
    id: track.id,
    codec: track.codec,
    codecString: await track.getCodecParameterString(),
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    averageFps: frameRate.averageFrameRate,
    decoderConfig,
    canDecode: await track.canDecode(),
  };
}

/** Strips the binary `description` so the config can be serialized into the report. */
export function serializableConfig(config: VideoDecoderConfig | null): Record<string, unknown> | null {
  if (!config) return null;
  const { description, ...rest } = config;
  return { ...rest, descriptionBytes: description ? byteLengthOf(description) : 0 };
}

function byteLengthOf(source: AllowSharedBufferSource): number {
  return 'byteLength' in source ? source.byteLength : 0;
}
