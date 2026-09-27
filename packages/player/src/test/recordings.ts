import { Signal, type Demuxer, type ResourceLocator, type VideoDecoderPort } from '@gyroview/core';
import {
  encodeBox,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  FakeVideoTrack,
  InfoRecordFormat,
  InMemoryRandomAccessSource,
  RecordType,
  TrailerFixtureBuilder,
  type FakeVideoTrackOptions,
} from '@gyroview/core/testing';

import type { RecordingPorts, SourceOpener } from '../composition/ports';
import { isUrlInput, type MediaInput } from '../PlayerSource';

export { default as X5_RECORDING_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';
export { default as X5_RECORDING_WITH_AUDIO_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-aac-64px-10fps-3s.mp4?url';

export async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The smallest file the box scanner accepts, followed by an indexed trailer holding only the
 * given info record: a recording without gyro, exposure or calibration.
 */
export function syntheticRecordingBytes(info: Uint8Array): Uint8Array {
  const prefix = Uint8Array.from([
    ...encodeBox('ftyp', new TextEncoder().encode('isom')),
    ...encodeBox('moov', new Uint8Array()),
  ]);
  return new TrailerFixtureBuilder()
    .withPrefix(prefix)
    .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
    .buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
}

/**
 * Two identical square lens tracks, as a one-file X-series recording has.
 */
export function squareTracks(options: Partial<FakeVideoTrackOptions> = {}): FakeVideoTrack[] {
  return [0, 1].map(
    (trackIndex) =>
      new FakeVideoTrack({
        trackIndex,
        frameRate: 10,
        frameCount: 30,
        framesPerGop: 10,
        codedSize: 64,
        ...options,
      }),
  );
}

/**
 * A source opener that serves every input from the bytes registered for its name or URL.
 */
export class MapSourceOpener implements SourceOpener {
  /**
   * The signal each source was opened with, in order.
   */
  public readonly signals: AbortSignal[] = [];
  private readonly sources = new Map<string, InMemoryRandomAccessSource>();

  public register(key: string, bytes: Uint8Array): InMemoryRandomAccessSource {
    const source = new InMemoryRandomAccessSource(bytes);
    this.sources.set(key, source);
    return source;
  }

  public open(input: MediaInput, signal: AbortSignal): InMemoryRandomAccessSource {
    this.signals.push(signal);
    const key = isUrlInput(input) ? input.url : input.name;
    const source = this.sources.get(key);
    if (!source) throw new Error(`no bytes registered for ${key}`);
    return source;
  }
}

interface FakePortsParts {
  readonly sources: SourceOpener;
  readonly demuxer: Demuxer;
  readonly decoderPort?: VideoDecoderPort;
  readonly locator?: ResourceLocator;
}

export function fakePorts(parts: FakePortsParts): RecordingPorts {
  return {
    sources: parts.sources,
    demuxer: parts.demuxer,
    decoderPort: parts.decoderPort ?? new FakeVideoDecoderPort(),
    locator: parts.locator ?? new FakeResourceLocator([]),
    probeDeadline: (): Signal => new Signal(),
  };
}
