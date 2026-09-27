import {
  CalibrationVersion,
  Deferred,
  GyroViewError,
  type VideoDecoderHandle,
  type VideoDecoderPort,
} from '@gyroview/core';
import {
  FakeDemuxer,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  FakeVideoTrack,
  minimalInfoRecord,
} from '@gyroview/core/testing';
import { seconds } from '@gyroview/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { openRecording } from './openRecording';
import type { PlayerSource } from '../PlayerSource';
import {
  fakePorts,
  fetchBytes,
  MapSourceOpener,
  squareTracks,
  syntheticRecordingBytes,
  X5_RECORDING_URL,
} from '../test/recordings';

const MAIN_URL = 'https://cdn.example/clips/VID_20260814_132640_00_013.insv';
const SECOND_URL = 'https://cdn.example/clips/VID_20260814_132640_10_013.insv';
/**
 * One track holding both lenses side by side, as the camera's low-resolution LRV file does.
 */
const PACKED_URL = 'https://cdn.example/clips/LRV_20260814_132640_01_013.lrv';
const HEVC = 'hvc1.fake';
const AVC = 'avc1.fake';

const fixture: { x5Bytes: Uint8Array } = { x5Bytes: new Uint8Array() };

beforeAll(async () => {
  fixture.x5Bytes = await fetchBytes(X5_RECORDING_URL);
});

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

function sourceOf(overrides: Partial<PlayerSource> = {}): PlayerSource {
  return {
    main: { url: MAIN_URL },
    second: undefined,
    ...overrides,
  };
}

function packedTrack(): FakeVideoTrack {
  return new FakeVideoTrack({
    trackIndex: 0,
    frameRate: 30,
    frameCount: 90,
    framesPerGop: 30,
    codedWidth: 1664,
    codedHeight: 832,
    codec: AVC,
  });
}

interface World {
  readonly opener: MapSourceOpener;
  readonly demuxer: FakeDemuxer;
}

/**
 * The X5 fixture at the main URL with two HEVC-labelled lens tracks, served from memory.
 */
function x5World(): World {
  const opener = new MapSourceOpener();
  const main = opener.register(MAIN_URL, fixture.x5Bytes);
  const demuxer = new FakeDemuxer([
    { source: main, duration: seconds(3), videoTracks: squareTracks({ codec: HEVC }) },
  ]);
  return { opener, demuxer };
}

describe('openRecording', () => {
  it('opens a one-file X5 recording: layout, lens order, calibration, timing and motion', async () => {
    const world = x5World();
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer });

    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('multi-track');
    // The X5 info record says track 0 is the screen-side lens, so lens 0 is track 1.
    expect(opened.frameSources.map((track) => track.description.trackIndex)).toEqual([1, 0]);
    expect(opened.calibration.version).toBe(CalibrationVersion.Mei);
    expect(opened.duration).toBe(3);
    expect(opened.frameTimes?.frameCount).toBe(30);
    expect(opened.motion?.orientations.length).toBe(2000);
    expect(opened.audioTrack).toBeUndefined();
    expect(opened.metadata).toMatchObject({
      model: 'Insta360 X5',
      layout: 'multi-track',
      calibrationVersion: CalibrationVersion.Mei,
      frameTimeSource: 'track-timestamps',
      hasGyro: true,
      imuFrame: { name: 'X5', isVerified: true },
      hasAudio: false,
      duration: 3,
    });
    expect(opened.metadata.tracks.map((track) => track.codec)).toEqual([HEVC, HEVC]);
    expect(opened.warnings).toEqual(['exposure-record unavailable']);
    expect(world.demuxer.openCount).toBe(1);
    opened.dispose();
    expect(world.demuxer.openCount).toBe(0);
  });

  it('refuses a recording without calibration and releases what it opened', async () => {
    const opener = new MapSourceOpener();
    const bytes = syntheticRecordingBytes(minimalInfoRecord({ model: 'Insta360 X3' }));
    const source = opener.register(MAIN_URL, bytes);
    const demuxer = new FakeDemuxer([
      { source, duration: seconds(3), videoTracks: squareTracks() },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'no-calibration' });
    expect(demuxer.openCount).toBe(0);
  });

  it('reports an undecodable recording with the probe verdicts', async () => {
    const world = x5World();
    const ports = fakePorts({
      sources: world.opener,
      demuxer: world.demuxer,
      decoderPort: new FakeVideoDecoderPort({ unsupportedCodecs: [HEVC] }),
    });

    const failure = await captureRejection(
      openRecording(sourceOf(), ports, new AbortController().signal),
    );

    expect(failure).toBeInstanceOf(GyroViewError);
    expect(failure).toMatchObject({ code: 'codec-unsupported' });
    expect((failure as Error).message).toContain('track 1 unsupported-configuration');
    expect(world.demuxer.openCount).toBe(0);
  });

  it('opens a recording whose one track packs both lenses', async () => {
    const opener = new MapSourceOpener();
    const packed = opener.register(PACKED_URL, fixture.x5Bytes);
    const demuxer = new FakeDemuxer([
      { source: packed, duration: seconds(3), videoTracks: [packedTrack()] },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });

    const opened = await openRecording(
      sourceOf({ main: { url: PACKED_URL } }),
      ports,
      new AbortController().signal,
    );

    expect(opened.layout.kind).toBe('packed');
    expect(opened.frameSources.map((track) => track.description.codec)).toEqual([AVC]);
    expect(demuxer.openCount).toBe(1);
  });

  it('asks for nothing beside a recording that opens by itself', async () => {
    const world = x5World();
    const locator = new FakeResourceLocator([]);
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer, locator });

    await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(locator.asked).toEqual([]);
  });

  it('fetches the other lens file of a split-file recording when the server has it', async () => {
    const opener = new MapSourceOpener();
    const main = opener.register(MAIN_URL, fixture.x5Bytes);
    const second = opener.register(SECOND_URL, fixture.x5Bytes);
    // Each file has one track, so both are track 0 of their own file.
    const [backTrack] = squareTracks();
    const [screenTrack] = squareTracks();
    const demuxer = new FakeDemuxer([
      { source: main, duration: seconds(3), videoTracks: [backTrack!] },
      { source: second, duration: seconds(2.5), videoTracks: [screenTrack!] },
    ]);
    const ports = fakePorts({
      sources: opener,
      demuxer,
      locator: new FakeResourceLocator([SECOND_URL]),
    });

    const opened = await openRecording(sourceOf(), ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    expect(opened.duration).toBe(2.5);
    expect(demuxer.openCount).toBe(2);
    opened.dispose();
    expect(demuxer.openCount).toBe(0);
  });

  it('reads the trailer from the second file when the first, the _10_ half, has none', async () => {
    const opener = new MapSourceOpener();
    const withoutTrailer = opener.register(SECOND_URL, new Uint8Array(4096));
    const withTrailer = opener.register(MAIN_URL, fixture.x5Bytes);
    const [screenTrack] = squareTracks();
    const [backTrack] = squareTracks();
    const demuxer = new FakeDemuxer([
      { source: withoutTrailer, duration: seconds(3), videoTracks: [screenTrack!] },
      { source: withTrailer, duration: seconds(3), videoTracks: [backTrack!] },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });
    const source = sourceOf({ main: { url: SECOND_URL }, second: { url: MAIN_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    expect(opened.recording.info.model).toBe('Insta360 X5');
    opened.dispose();
  });

  it('asks for the other file of a lone _10_ file without a trailer, not calling it damaged', async () => {
    const opener = new MapSourceOpener();
    const withoutTrailer = opener.register(SECOND_URL, new Uint8Array(4096));
    const [screenTrack] = squareTracks();
    const demuxer = new FakeDemuxer([
      { source: withoutTrailer, duration: seconds(3), videoTracks: [screenTrack!] },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });
    const source = sourceOf({ main: { url: SECOND_URL } });

    await expect(openRecording(source, ports, new AbortController().signal)).rejects.toMatchObject({
      code: 'missing-second-file',
    });
    expect(demuxer.openCount).toBe(0);
  });

  it('calls a file without a trailer damaged when its tracks are no half of a pair', async () => {
    const opener = new MapSourceOpener();
    const withoutTrailer = opener.register(MAIN_URL, new Uint8Array(4096));
    const demuxer = new FakeDemuxer([
      { source: withoutTrailer, duration: seconds(3), videoTracks: squareTracks() },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('plays the sound of the pair from whichever file carries it', async () => {
    const opener = new MapSourceOpener();
    const withoutTrailer = opener.register(SECOND_URL, new Uint8Array(4096));
    const withTrailer = opener.register(MAIN_URL, fixture.x5Bytes);
    const [screenTrack] = squareTracks();
    const [backTrack] = squareTracks();
    const sound = { openSegments: (): Promise<never> => Promise.reject(new Error('not needed')) };
    const demuxer = new FakeDemuxer([
      { source: withoutTrailer, duration: seconds(3), videoTracks: [screenTrack!] },
      {
        source: withTrailer,
        duration: seconds(3),
        videoTracks: [backTrack!],
        audioTracks: [sound],
      },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });
    const source = sourceOf({ main: { url: SECOND_URL }, second: { url: MAIN_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(opened.audioTrack).toBe(sound);
    opened.dispose();
  });

  it('fetches the _00_ file for a lone _10_ file that has no trailer', async () => {
    const opener = new MapSourceOpener();
    const withoutTrailer = opener.register(SECOND_URL, new Uint8Array(4096));
    const withTrailer = opener.register(MAIN_URL, fixture.x5Bytes);
    const [screenTrack] = squareTracks();
    const [backTrack] = squareTracks();
    const demuxer = new FakeDemuxer([
      { source: withoutTrailer, duration: seconds(3), videoTracks: [screenTrack!] },
      { source: withTrailer, duration: seconds(3), videoTracks: [backTrack!] },
    ]);
    const ports = fakePorts({
      sources: opener,
      demuxer,
      locator: new FakeResourceLocator([MAIN_URL]),
    });
    const source = sourceOf({ main: { url: SECOND_URL } });

    const opened = await openRecording(source, ports, new AbortController().signal);

    expect(opened.layout.kind).toBe('split-files');
    opened.dispose();
  });

  it('reports a lone half of a pair when the sibling is not there', async () => {
    const opener = new MapSourceOpener();
    const main = opener.register(MAIN_URL, fixture.x5Bytes);
    const [onlyTrack] = squareTracks();
    const demuxer = new FakeDemuxer([
      { source: main, duration: seconds(3), videoTracks: [onlyTrack!] },
    ]);
    const ports = fakePorts({ sources: opener, demuxer });

    await expect(
      openRecording(sourceOf(), ports, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'missing-second-file' });
    expect(demuxer.openCount).toBe(0);
  });

  it('ends a stalled decode probe as soon as it is aborted, closing its decoders', async () => {
    const world = x5World();
    const decoderPort = new StallingDecoderPort();
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer, decoderPort });
    const controller = new AbortController();
    const opening = openRecording(sourceOf(), ports, controller.signal);
    await decoderPort.created.promise;
    controller.abort();

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(decoderPort.openDecoders).toBe(0);
  });

  it('opens its sources with the load signal, so a load given up stops reading', async () => {
    const world = x5World();
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer });
    const controller = new AbortController();
    const opened = await openRecording(sourceOf(), ports, controller.signal);
    opened.dispose();
    expect(world.opener.signals.length).toBeGreaterThan(0);
    expect(world.opener.signals.every((signal) => signal === controller.signal)).toBe(true);
  });

  it('stops at the first check after an abort and leaves nothing open', async () => {
    const world = x5World();
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer });
    const controller = new AbortController();
    const opening = openRecording(sourceOf(), ports, controller.signal);
    controller.abort();

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(world.demuxer.openCount).toBe(0);
  });
});
