import {
  CalibrationVersion,
  Deferred,
  GyroViewError,
  seconds,
  type ContainerCodecs,
  type EncodedVideoPacket,
  type TrackColour,
  type VideoDecoderHandle,
  type VideoDecoderPort,
  type VideoTrackReader,
} from '@gyroview/core';
import {
  AS_RECORDED,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  HLG_TO_SDR_BT709,
  lensMp4File,
  minimalInfoRecord,
  type SimulatedLink,
} from '@gyroview/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { openRecording } from './openRecording';
import type { OpenedRecording } from './OpenedRecording';
import type { RecordingPorts } from './ports';
import type { PlayerSource, RecordingFetch, UrlInput } from '../PlayerSource';
import {
  codecReaderFor,
  fakePorts,
  fetchBytes,
  lensCodecs,
  MapSourceOpener,
  RecordingAudioPackager,
  SOUND_CONFIGURATION,
  syntheticRecordingBytes,
  X5_RECORDING_URL,
  X5_RECORDING_WITH_AUDIO_URL,
  type FakePortsParts,
} from '../test/recordings';
import { settle } from '../test/waiting';

/**
 * A page's own fetch, sending each request as it is.
 */
const pageFetch: RecordingFetch = (url, init) => fetch(url, init);

const MAIN_URL = 'https://cdn.example/clips/VID_20260814_132640_00_013.insv';
const SECOND_URL = 'https://cdn.example/clips/VID_20260814_132640_10_013.insv';
/**
 * One track holding both lenses side by side, as the camera's low-resolution LRV file does.
 */
const PACKED_URL = 'https://cdn.example/clips/LRV_20260814_132640_01_013.lrv';
const HEVC = 'hvc1.fake';
/**
 * The info record's file layout value for a recording split into one file per lens.
 */
const SPLIT_FILES = 1;
const AVC = 'avc1.fake';
const X5_TRAILER_BOX = 'inst';
const BOX_HEADER = 8;

const fixture = { x5Bytes: new Uint8Array(), x5WithSoundBytes: new Uint8Array() };

beforeAll(async () => {
  fixture.x5Bytes = await fetchBytes(X5_RECORDING_URL);
  fixture.x5WithSoundBytes = await fetchBytes(X5_RECORDING_WITH_AUDIO_URL);
});

/**
 * A file the opener serves, and the codecs the codec reader tells of it.
 */
interface ServedFile {
  readonly url: string;
  readonly bytes: Uint8Array;
  readonly codecs: ContainerCodecs;
}

interface World {
  readonly opener: MapSourceOpener;
  readonly ports: RecordingPorts;
}

type OtherPorts = Omit<FakePortsParts, 'sources' | 'codecReader'>;

async function worldOf(files: readonly ServedFile[], other: OtherPorts = {}): Promise<World> {
  const opener = new MapSourceOpener();
  for (const file of files) opener.register(file.url, file.bytes);
  const codecReader = await codecReaderFor(files.map((file) => [file.bytes, file.codecs]));
  return { opener, ports: fakePorts({ sources: opener, codecReader, ...other }) };
}

/**
 * The X5 fixture at `url`, its two lens tracks labelled HEVC.
 */
function x5File(url = MAIN_URL): ServedFile {
  return { url, bytes: fixture.x5Bytes, codecs: lensCodecs({ lenses: 2, codec: HEVC }) };
}

/**
 * The X5 fixture read as one lens of a split pair: the codec reader tells of its first track
 * alone.
 */
function x5Half(url: string): ServedFile {
  return { url, bytes: fixture.x5Bytes, codecs: lensCodecs({ lenses: 1 }) };
}

/**
 * One lens file without a trailer, as the _10_ file of an older camera's pair is.
 */
function bareHalf(url: string, frames?: number): ServedFile {
  const bytes = lensMp4File({ lenses: 1, ...(frames !== undefined && { frames }) }).bytes;
  return { url, bytes, codecs: lensCodecs({ lenses: 1 }) };
}

/**
 * The half an info record calls split, with no calibration: a load of it stops once its layout
 * is known.
 */
function declaredSplitHalf(url: string): ServedFile {
  const info = minimalInfoRecord({ model: 'Insta360 X3', fileLayout: SPLIT_FILES });
  const bytes = syntheticRecordingBytes(info, lensMp4File({ lenses: 1 }).bytes);
  return { url, bytes, codecs: lensCodecs({ lenses: 1 }) };
}

/**
 * The X5 fixture's trailer, a box of its own after the movie: it tells its records' places from
 * the end of the file, so it reads the same after other tracks.
 */
function x5Trailer(): Uint8Array {
  const view = new DataView(fixture.x5Bytes.buffer, fixture.x5Bytes.byteOffset);
  let offset = 0;
  while (
    new TextDecoder().decode(fixture.x5Bytes.subarray(offset + 4, offset + BOX_HEADER)) !==
    X5_TRAILER_BOX
  ) {
    offset += view.getUint32(offset);
  }
  return fixture.x5Bytes.subarray(offset);
}

/**
 * A decoder port whose decoders never produce a picture, as a stalled hardware decoder does.
 */
class StallingDecoderPort implements VideoDecoderPort {
  public readonly created = new Deferred<void>();
  public openDecoders = 0;

  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(): Promise<VideoDecoderHandle> {
    this.openDecoders += 1;
    this.created.resolve();
    return Promise.resolve({
      pendingCount: 1,
      decode: (): void => undefined,
      waitForPendingBelow: (): Promise<void> => new Deferred<void>().promise,
      flush: (): Promise<void> => new Deferred<void>().promise,
      close: (): void => {
        this.openDecoders -= 1;
      },
    });
  }
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

const SDR_BT709: TrackColour = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  range: 'full',
};

const HLG_BT2020: TrackColour = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  range: 'limited',
};

/**
 * The X5 fixture opened as though both lens tracks declared `colour`.
 */
async function openWithLensColour(colour: TrackColour): Promise<OpenedRecording> {
  const codecs = lensCodecs({ lenses: 2, codec: HEVC, colour });
  const { ports } = await worldOf([{ url: MAIN_URL, bytes: fixture.x5Bytes, codecs }]);
  return openRecording(sourceOf(), ports, new AbortController().signal);
}

function sourceOf(overrides: Partial<PlayerSource> = {}): PlayerSource {
  return {
    main: { url: MAIN_URL },
    second: undefined,
    ...overrides,
  };
}

async function firstPacketOf(track: VideoTrackReader | undefined): Promise<unknown> {
  const packets = track?.packetsFrom(seconds(0))[Symbol.asyncIterator]();
  const first: IteratorResult<EncodedVideoPacket> | undefined = await packets?.next();
  await packets?.return?.();
  return first?.done === false ? first.value : undefined;
}

async function untilAsked(link: SimulatedLink): Promise<void> {
  while (link.requests.length === 0) await settle();
}

function isAllGivenUp(link: SimulatedLink): boolean {
  return link.requests.every((request) => request.endedAt !== undefined);
}

describe('openRecording', () => {
  it('opens a one-file X5 recording: layout, lens order, calibration, timing and motion', async () => {
    const { ports } = await worldOf([x5File()]);

    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('multi-track');
    // The X5 info record says track 0 is the screen-side lens, so lens 0 is track 1.
    expect(opened.frameSources.map((track) => track.description.trackIndex)).toEqual([1, 0]);
    expect(opened.calibration.version).toBe(CalibrationVersion.Legacy);
    expect(opened.duration).toBeCloseTo(3, 6);
    expect(opened.frameTimes?.frameCount).toBe(30);
    expect(opened.motion?.orientations.length).toBe(2000);
    expect(opened.soundSegments).toBeUndefined();
    expect(opened.metadata).toMatchObject({
      model: 'Insta360 X5',
      layout: 'multi-track',
      calibrationVersion: CalibrationVersion.Legacy,
      frameTimeSource: 'track-timestamps',
      hasGyro: true,
      imuFrame: { name: 'X5', isVerified: true },
      hasAudio: false,
    });
    expect(opened.metadata.duration).toBeCloseTo(3, 6);
    expect(opened.metadata.tracks.map((track) => track.codec)).toEqual([HEVC, HEVC]);
    expect(opened.warnings).toEqual(['exposure-record unavailable']);
    await expect(firstPacketOf(opened.frameSources[0])).resolves.toBeDefined();
    opened.dispose();
    await expect(firstPacketOf(opened.frameSources[0])).resolves.toBeUndefined();
  });

  it('tells from its downloads whether playing that starved can go on', async () => {
    const { ports } = await worldOf([x5File()]);
    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);
    const packets = opened.frameSources[0]?.packetsFrom(seconds(0))[Symbol.asyncIterator]();
    await packets?.next();
    expect(opened.buffer.isReadyToResumeAt(seconds(0))).toBe(false);

    opened.readAhead();
    await settle();

    expect(opened.buffer.isReadyToResumeAt(seconds(0))).toBe(true);
    await packets?.return?.();
    opened.dispose();
  });

  it('refuses a recording without calibration', async () => {
    const bytes = syntheticRecordingBytes(minimalInfoRecord({ model: 'Insta360 X3' }));
    const { ports } = await worldOf([{ url: MAIN_URL, bytes, codecs: lensCodecs({ lenses: 2 }) }]);

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'no-calibration' });
  });

  it('reports an undecodable recording with the probe verdicts', async () => {
    const decoderPort = new FakeVideoDecoderPort({ unsupportedCodecs: [HEVC] });
    const { ports } = await worldOf([x5File()], { decoderPort });

    const failure = await captureRejection(
      openRecording(sourceOf(), ports, new AbortController().signal),
    );

    expect(failure).toBeInstanceOf(GyroViewError);
    expect(failure).toMatchObject({ code: 'codec-unsupported' });
    expect((failure as Error).message).toContain('track 1 unsupported-configuration');
  });

  it('blames the file, not the browser, when its tracks have no key frame to start from', async () => {
    const tracks = lensMp4File({ lenses: 2, keyframes: 'none' }).bytes;
    const bytes = Uint8Array.from([...tracks, ...x5Trailer()]);
    const codecs = lensCodecs({ lenses: 2, codec: HEVC });
    const { ports } = await worldOf([{ url: MAIN_URL, bytes, codecs }]);

    const failure = await captureRejection(
      openRecording(sourceOf(), ports, new AbortController().signal),
    );

    expect(failure).toMatchObject({ code: 'no-key-frame' });
    expect((failure as Error).message).toContain('track 0 no-key-frame');
  });

  it('asks for the other lens file once when the info record calls the recording split and it is not there', async () => {
    const locator = new FakeResourceLocator([]);
    const { ports } = await worldOf([declaredSplitHalf(MAIN_URL)], { locator });

    const failure = await captureRejection(
      openRecording(sourceOf(), ports, new AbortController().signal),
    );

    expect(failure).toMatchObject({ code: 'missing-second-file' });
    expect(locator.asked).toEqual([SECOND_URL]);
  });

  it('blames the network, not the browser, when the first frames do not arrive in time, and gives up its reads', async () => {
    const deadline = new Deferred<void>();
    const world = await worldOf([x5File()]);
    const link = world.opener.stall(MAIN_URL, fixture.x5Bytes);
    const ports = { ...world.ports, probeDeadline: (): Deferred<void> => deadline };

    const opening = captureRejection(
      openRecording(sourceOf(), ports, new AbortController().signal),
    );
    await untilAsked(link);
    deadline.resolve();
    const failure = await opening;

    expect(failure).toMatchObject({ code: 'source-unreadable' });
    expect((failure as Error).message).toContain('track 0 key-frame-late');
    expect(isAllGivenUp(link)).toBe(true);
  });

  it("blames the network when one lens waits for its key frame while the other's decoder is still busy", async () => {
    const deadline = new Deferred<void>();
    const decoderPort = new StallingDecoderPort();
    const late = bareHalf(SECOND_URL);
    const world = await worldOf([x5Half(MAIN_URL), late], { decoderPort });
    world.opener.stall(SECOND_URL, late.bytes);
    const ports = { ...world.ports, probeDeadline: (): Deferred<void> => deadline };
    void decoderPort.created.promise.then(() => {
      deadline.resolve();
    });

    const failure = await captureRejection(
      openRecording(sourceOf({ second: { url: SECOND_URL } }), ports, new AbortController().signal),
    );

    expect(failure).toMatchObject({ code: 'source-unreadable' });
    expect((failure as Error).message).toContain('timed-out');
    expect((failure as Error).message).toContain('key-frame-late');
  });

  it('shows HLG lenses through the HLG conversion, with no warning of their colour', async () => {
    const asRecorded = await openWithLensColour(SDR_BT709);
    const shown = await openWithLensColour(HLG_BT2020);
    expect(shown.displayConversions).toEqual([HLG_TO_SDR_BT709, HLG_TO_SDR_BT709]);
    expect(shown.warnings).toEqual(asRecorded.warnings);
    asRecorded.dispose();
    shown.dispose();
  });

  it('draws lenses of a transfer it cannot show as recorded, and warns of it once', async () => {
    const asRecorded = await openWithLensColour(SDR_BT709);
    const unshown = await openWithLensColour({ ...HLG_BT2020, transfer: 'pq' });
    const asRecordedBt2020 = { ...AS_RECORDED, matrix: 'bt2020-ncl' };
    expect(unshown.displayConversions).toEqual([asRecordedBt2020, asRecordedBt2020]);
    expect(unshown.warnings).toEqual([
      ...asRecorded.warnings,
      'the pq transfer cannot be shown yet: drawn as recorded',
    ]);
    asRecorded.dispose();
    unshown.dispose();
  });

  it('opens a recording whose one track packs both lenses', async () => {
    const codecs = lensCodecs({ lenses: 1, codec: AVC, codedWidth: 1664, codedHeight: 832 });
    const { ports } = await worldOf([{ url: PACKED_URL, bytes: fixture.x5Bytes, codecs }]);

    const opened = await openRecording(
      sourceOf({ main: { url: PACKED_URL } }),
      ports,
      new AbortController().signal,
    );

    expect(opened.layout.kind).toBe('packed');
    expect(opened.frameSources.map((track) => track.description.codec)).toEqual([AVC]);
    opened.dispose();
  });

  it('asks for nothing beside a recording that opens by itself', async () => {
    const locator = new FakeResourceLocator([]);
    const { ports } = await worldOf([x5File()], { locator });

    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(locator.asked).toEqual([]);
    opened.dispose();
  });

  it('fetches the other lens file of a split-file recording when the server has it', async () => {
    const locator = new FakeResourceLocator([SECOND_URL]);
    const { ports } = await worldOf([x5Half(MAIN_URL), bareHalf(SECOND_URL, 25)], { locator });

    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    expect(opened.duration).toBeCloseTo(2.5, 6);
    await expect(firstPacketOf(opened.frameSources[1])).resolves.toBeDefined();
    opened.dispose();
    await expect(firstPacketOf(opened.frameSources[1])).resolves.toBeUndefined();
  });

  it('finds the other lens file before reading the tracks when the info record says the recording is split', async () => {
    const locator = new FakeResourceLocator([SECOND_URL]);
    const world = await worldOf([declaredSplitHalf(MAIN_URL), bareHalf(SECOND_URL)], { locator });
    const movies: Uint8Array[] = [];
    const codecReader = {
      read: (movieBytes: Uint8Array): Promise<ContainerCodecs> => {
        movies.push(movieBytes);
        return world.ports.codecReader.read(movieBytes);
      },
    };

    // The minimal info record carries no calibration: the load stops once the layout is known.
    const failure = await captureRejection(
      openRecording(sourceOf(), { ...world.ports, codecReader }, new AbortController().signal),
    );

    expect(failure).toMatchObject({ code: 'no-calibration' });
    expect(movies).toHaveLength(2);
  });

  it('looks for and reads the other lens file with the credentials of the main one', async () => {
    const locator = new FakeResourceLocator([SECOND_URL]);
    const world = await worldOf([x5Half(MAIN_URL), bareHalf(SECOND_URL)]);
    const lookedBeside: UrlInput[] = [];
    const ports = {
      ...world.ports,
      locatorFor: (input: UrlInput): FakeResourceLocator => {
        lookedBeside.push(input);
        return locator;
      },
    };
    const source = sourceOf({ main: { url: MAIN_URL, credentials: 'include' } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(lookedBeside).toEqual([{ url: MAIN_URL, credentials: 'include' }]);
    expect(world.opener.inputs).toContainEqual({ url: SECOND_URL, credentials: 'include' });
    opened.dispose();
  });

  it('looks for and reads the other lens file through the fetch of the main one', async () => {
    const locator = new FakeResourceLocator([SECOND_URL]);
    const world = await worldOf([x5Half(MAIN_URL), bareHalf(SECOND_URL)]);
    const lookedBeside: UrlInput[] = [];
    const ports = {
      ...world.ports,
      locatorFor: (input: UrlInput): FakeResourceLocator => {
        lookedBeside.push(input);
        return locator;
      },
    };
    const source = sourceOf({ main: { url: MAIN_URL, fetch: pageFetch } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(lookedBeside).toEqual([{ url: MAIN_URL, fetch: pageFetch }]);
    expect(world.opener.inputs).toContainEqual({ url: SECOND_URL, fetch: pageFetch });
    opened.dispose();
  });

  it('reads the other lens file an info record declares with the credentials of the main one', async () => {
    const locator = new FakeResourceLocator([SECOND_URL]);
    const world = await worldOf([declaredSplitHalf(MAIN_URL), bareHalf(SECOND_URL)], { locator });
    const source = sourceOf({ main: { url: MAIN_URL, credentials: 'include' } });

    // The minimal info record carries no calibration: the load stops once the layout is known.
    await captureRejection(openRecording(source, world.ports, new AbortController().signal));

    expect(world.opener.inputs).toEqual([
      { url: MAIN_URL, credentials: 'include' },
      { url: SECOND_URL, credentials: 'include' },
    ]);
  });

  it('reads the trailer from the second file when the first, the _10_ half, has none', async () => {
    const { ports } = await worldOf([bareHalf(SECOND_URL), x5Half(MAIN_URL)]);
    const source = sourceOf({ main: { url: SECOND_URL }, second: { url: MAIN_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    expect(opened.recording.info.model).toBe('Insta360 X5');
    opened.dispose();
  });

  it('asks for the other file of a lone _10_ file without a trailer, not calling it damaged', async () => {
    const { ports } = await worldOf([bareHalf(SECOND_URL)]);
    const source = sourceOf({ main: { url: SECOND_URL } });

    await expect(openRecording(source, ports, new AbortController().signal)).rejects.toMatchObject({
      code: 'missing-second-file',
    });
  });

  it('calls a file without a trailer damaged when its tracks are no half of a pair', async () => {
    const bytes = lensMp4File({ lenses: 2 }).bytes;
    const { ports } = await worldOf([{ url: MAIN_URL, bytes, codecs: lensCodecs({ lenses: 2 }) }]);

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('plays the sound of the pair from whichever file carries it', async () => {
    const audioPackager = new RecordingAudioPackager();
    const withSound: ServedFile = {
      url: MAIN_URL,
      bytes: fixture.x5WithSoundBytes,
      codecs: {
        video: lensCodecs({ lenses: 1 }).video,
        audio: [{ trackId: 3, configuration: SOUND_CONFIGURATION }],
      },
    };
    const { ports } = await worldOf([bareHalf(SECOND_URL), withSound], { audioPackager });
    const source = sourceOf({ main: { url: SECOND_URL }, second: { url: MAIN_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);
    opened.soundSegments?.();

    expect(opened.metadata.hasAudio).toBe(true);
    expect(audioPackager.packaged).toEqual([SOUND_CONFIGURATION]);
    opened.dispose();
  });

  it('fetches the _00_ file for a lone _10_ file that has no trailer', async () => {
    const locator = new FakeResourceLocator([MAIN_URL]);
    const { ports } = await worldOf([bareHalf(SECOND_URL), x5Half(MAIN_URL)], { locator });
    const source = sourceOf({ main: { url: SECOND_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    opened.dispose();
  });

  it('reports a lone half of a pair when the sibling is not there', async () => {
    const { ports } = await worldOf([x5Half(MAIN_URL)]);

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'missing-second-file' });
  });

  it('ends a stalled decode probe as soon as it is aborted, closing its decoders', async () => {
    const decoderPort = new StallingDecoderPort();
    const { ports } = await worldOf([x5File()], { decoderPort });
    const controller = new AbortController();
    const opening = openRecording(sourceOf(), ports, controller.signal);
    await decoderPort.created.promise;
    controller.abort();

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(decoderPort.openDecoders).toBe(0);
  });

  it('opens its sources with the load signal, so a load given up stops reading', async () => {
    const world = await worldOf([x5File()]);
    const controller = new AbortController();
    const opened = await openRecording(sourceOf(), world.ports, controller.signal);
    opened.dispose();
    expect(world.opener.signals.length).toBeGreaterThan(0);
    expect(world.opener.signals.every((signal) => signal === controller.signal)).toBe(true);
  });

  it('stops at the first check after an abort', async () => {
    const { ports } = await worldOf([x5File()]);
    const controller = new AbortController();
    const opening = openRecording(sourceOf(), ports, controller.signal);
    controller.abort();

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  });
});
