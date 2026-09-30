import {
  Deferred,
  readSampleTable,
  SourceByteStream,
  type AudioDecoderConfiguration,
  type AudioPackager,
  type AudioSampleSource,
  type AudioSegmentSource,
  type CodecReader,
  type ContainerCodecs,
  type ResourceLocator,
  type VideoDecoderPort,
} from '@gyroview/core';
import {
  FakeCodecReader,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  InfoRecordFormat,
  InMemoryRandomAccessSource,
  lensMp4File,
  RecordType,
  SimulatedLink,
  TrailerFixtureBuilder,
} from '@gyroview/core/testing';

import type { OpenedSource, RecordingPorts, SourceOpener } from '../composition/ports';
import { isUrlInput, type MediaInput } from '../PlayerSource';

export { default as X5_RECORDING_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';
export { default as X5_RECORDING_WITH_AUDIO_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-aac-64px-10fps-3s.mp4?url';

export async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * A recording's file in bytes: the given MP4 (two square lens tracks by default), followed by an
 * indexed trailer holding only the given info record, a recording without gyro, exposure or
 * calibration.
 */
export function syntheticRecordingBytes(
  info: Uint8Array,
  file: Uint8Array = lensMp4File({ lenses: 2 }).bytes,
): Uint8Array {
  return new TrailerFixtureBuilder()
    .withPrefix(file)
    .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
    .buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
}

export interface LensCodecsSpec {
  /**
   * Lens tracks, their ids counted from 1 as `lensMp4File` and the X5 fixture number theirs.
   */
  readonly lenses: number;
  readonly codec?: string;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  /**
   * A sound track after the lenses.
   */
  readonly hasSound?: boolean;
}

const LENS_SIZE = 64;
export const SOUND_CONFIGURATION: AudioDecoderConfiguration = {
  codec: 'mp4a.40.2',
  sampleRate: 48_000,
  numberOfChannels: 2,
  description: undefined,
};

/**
 * The codecs a codec reader tells of a file's lens tracks, and of its sound track.
 */
export function lensCodecs(spec: LensCodecsSpec): ContainerCodecs {
  const codec = spec.codec ?? 'avc1.fake';
  const size = {
    codedWidth: spec.codedWidth ?? LENS_SIZE,
    codedHeight: spec.codedHeight ?? LENS_SIZE,
  };
  const video = Array.from({ length: spec.lenses }, (_, trackIndex) => ({
    trackId: trackIndex + 1,
    description: { trackIndex, codec, ...size },
    configuration: { codec, ...size, description: undefined, isFullRange: false },
  }));
  const soundId = spec.lenses + 1;
  const audio =
    spec.hasSound === true ? [{ trackId: soundId, configuration: SOUND_CONFIGURATION }] : [];
  return { video, audio };
}

/**
 * A codec reader that tells, of each file given, the codecs given with it.
 */
export async function codecReaderFor(
  files: readonly (readonly [Uint8Array, ContainerCodecs])[],
): Promise<FakeCodecReader> {
  const registrations = await Promise.all(
    files.map(async ([bytes, codecs]) => {
      const { movieBytes } = await readSampleTable(new InMemoryRandomAccessSource(bytes));
      return [movieBytes, codecs] as const;
    }),
  );
  return new FakeCodecReader(registrations);
}

/**
 * A source opener that serves every input from the bytes registered for its name or URL; the
 * byte stream of a stalled one never brings a byte.
 */
export class MapSourceOpener implements SourceOpener {
  /**
   * The signal each source was opened with, in order.
   */
  public readonly signals: AbortSignal[] = [];
  /**
   * Each input a source was opened for, in order.
   */
  public readonly inputs: MediaInput[] = [];
  private readonly sources = new Map<string, InMemoryRandomAccessSource>();
  private readonly stalledStreams = new Map<string, SimulatedLink>();

  public register(key: string, bytes: Uint8Array): InMemoryRandomAccessSource {
    const source = new InMemoryRandomAccessSource(bytes);
    this.sources.set(key, source);
    return source;
  }

  /**
   * The registered file's stream brings nothing from now on; its link tells what was asked.
   */
  public stall(key: string, bytes: Uint8Array): SimulatedLink {
    const link = new SimulatedLink(bytes, { bytesPerTick: 1, latencyTicks: 0 });
    this.stalledStreams.set(key, link);
    return link;
  }

  public open(input: MediaInput, signal: AbortSignal): OpenedSource {
    this.signals.push(signal);
    this.inputs.push(input);
    const key = isUrlInput(input) ? input.url : input.name;
    const source = this.sources.get(key);
    if (!source) throw new Error(`no bytes registered for ${key}`);
    return { source, stream: this.stalledStreams.get(key) ?? new SourceByteStream(source) };
  }
}

/**
 * An audio packager that remembers what it packaged, and packages nothing a clock can play.
 */
export class RecordingAudioPackager implements AudioPackager {
  public readonly packaged: AudioDecoderConfiguration[] = [];

  public segmentsOf(
    samples: AudioSampleSource,
    configuration: AudioDecoderConfiguration,
  ): AudioSegmentSource {
    this.packaged.push(configuration);
    return {
      mimeType: 'audio/mp4; codecs="fake"',
      duration: samples.duration,
      segmentsFrom: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve(DONE) }),
      }),
    };
  }
}

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

export interface FakePortsParts {
  readonly sources: SourceOpener;
  readonly codecReader: CodecReader;
  readonly audioPackager?: AudioPackager;
  readonly decoderPort?: VideoDecoderPort;
  readonly locator?: ResourceLocator;
}

export function fakePorts(parts: FakePortsParts): RecordingPorts {
  const locator = parts.locator ?? new FakeResourceLocator([]);
  return {
    sources: parts.sources,
    codecReader: parts.codecReader,
    audioPackager: parts.audioPackager ?? new RecordingAudioPackager(),
    decoderPort: parts.decoderPort ?? new FakeVideoDecoderPort(),
    locatorFor: (): ResourceLocator => locator,
    probeDeadline: (): Deferred<void> => new Deferred<void>(),
  };
}
