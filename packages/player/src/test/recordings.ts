import {
  readRecording,
  RecordType,
  Signal,
  type Demuxer,
  type Recording,
  type ResourceLocator,
  type VideoDecoderPort,
} from '@gyroview/core';
import {
  encodeBox,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  FakeVideoTrack,
  InMemoryRandomAccessSource,
  TrailerFixtureBuilder,
  type FakeVideoTrackOptions,
} from '@gyroview/core/testing';

import type { RecordingPorts, SourceOpener } from '../composition/ports';
import type { MediaInput } from '../PlayerSource';
import exposureUrl from '../../../../test/fixtures/x5/office/record-04-exposure-first16.bin?url';
import gyroUrl from '../../../../test/fixtures/x5/office/record-03-gyro-first2000.bin?url';
import infoUrl from '../../../../test/fixtures/x5/office/record-01-info.bin?url';

export { default as X5_RECORDING_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';
export { default as X5_RECORDING_WITH_AUDIO_URL } from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-aac-64px-10fps-3s.mp4?url';

const PROTOBUF_FORMAT = 1;
const INFO_MODEL_FIELD = 2;
const INFO_FRAME_RATE_FIELD = 20;
const INFO_FIRST_FRAME_TIMESTAMP_FIELD = 24;
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_TYPE_BITS = 3;
const VARINT_CONTINUE = 0x80;
const VARINT_MASK = 0x7f;

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export interface OfficeRecords {
  readonly info: Uint8Array;
  readonly gyro: Uint8Array;
  readonly exposure: Uint8Array;
}

export async function officeRecords(): Promise<OfficeRecords> {
  const [info, gyro, exposure] = await Promise.all([
    fetchBytes(infoUrl),
    fetchBytes(gyroUrl),
    fetchBytes(exposureUrl),
  ]);
  return { info, gyro, exposure };
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= VARINT_CONTINUE) {
    bytes.push((remaining & VARINT_MASK) | VARINT_CONTINUE);
    remaining = Math.floor(remaining / VARINT_CONTINUE);
  }
  bytes.push(remaining);
  return bytes;
}

function tagOf(field: number, wireType: number): number[] {
  return encodeVarint((field << WIRE_TYPE_BITS) | wireType);
}

function varintField(field: number, value: number | undefined): number[] {
  return value === undefined ? [] : [...tagOf(field, WIRE_VARINT), ...encodeVarint(value)];
}

export interface MinimalInfo {
  readonly model: string;
  readonly frameRate?: number;
  readonly firstFrameTimestamp?: number;
}

/**
 * A hand-encoded info record with just the fields named: enough to read a recording of a
 * camera without calibration or timing, which no committed fixture represents.
 */
export function minimalInfoRecord(info: MinimalInfo): Uint8Array {
  const model = new TextEncoder().encode(info.model);
  const modelField = [
    ...tagOf(INFO_MODEL_FIELD, WIRE_LENGTH_DELIMITED),
    ...encodeVarint(model.byteLength),
    ...model,
  ];
  return Uint8Array.from([
    ...modelField,
    ...varintField(INFO_FRAME_RATE_FIELD, info.frameRate),
    ...varintField(INFO_FIRST_FRAME_TIMESTAMP_FIELD, info.firstFrameTimestamp),
  ]);
}

export interface SyntheticTrailer {
  readonly info: Uint8Array;
  readonly gyro?: Uint8Array;
  readonly exposure?: Uint8Array;
}

/**
 * The smallest file the box scanner accepts, followed by an indexed trailer of the records given.
 */
export function syntheticRecordingBytes(trailer: SyntheticTrailer): Uint8Array {
  const prefix = Uint8Array.from([
    ...encodeBox('ftyp', new TextEncoder().encode('isom')),
    ...encodeBox('moov', new Uint8Array()),
  ]);
  const builder = new TrailerFixtureBuilder()
    .withPrefix(prefix)
    .addRecord({ id: RecordType.Info, format: PROTOBUF_FORMAT, payload: trailer.info });
  if (trailer.gyro) builder.addRecord({ id: RecordType.Gyro, payload: trailer.gyro });
  if (trailer.exposure) builder.addRecord({ id: RecordType.Exposure, payload: trailer.exposure });
  return builder.buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
}

export function recordingOf(bytes: Uint8Array): Promise<Recording> {
  return readRecording(new InMemoryRandomAccessSource(bytes));
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
  public readonly sources = new Map<string, InMemoryRandomAccessSource>();

  public register(key: string, bytes: Uint8Array): InMemoryRandomAccessSource {
    const source = new InMemoryRandomAccessSource(bytes);
    this.sources.set(key, source);
    return source;
  }

  public open(input: MediaInput): InMemoryRandomAccessSource {
    const key = 'url' in input ? input.url : input.name;
    const source = this.sources.get(key);
    if (!source) throw new Error(`no bytes registered for ${key}`);
    return source;
  }
}

export interface FakePortsParts {
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
