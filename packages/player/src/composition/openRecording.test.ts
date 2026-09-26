import { CalibrationVersion, GyroViewError } from '@gyroview/core';
import {
  FakeDemuxer,
  FakeResourceLocator,
  FakeVideoDecoderPort,
  FakeVideoTrack,
} from '@gyroview/core/testing';
import { seconds } from '@gyroview/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { openRecording } from './openRecording';
import type { PlayerSource } from '../PlayerSource';
import {
  fakePorts,
  fetchBytes,
  MapSourceOpener,
  minimalInfoRecord,
  squareTracks,
  syntheticRecordingBytes,
  X5_RECORDING_URL,
} from '../test/recordings';

const MAIN_URL = 'https://cdn.example/clips/VID_20260814_132640_00_013.insv';
const SECOND_URL = 'https://cdn.example/clips/VID_20260814_132640_10_013.insv';
const PROXY_URL = 'https://cdn.example/clips/LRV_20260814_132640_01_013.lrv';
const HEVC = 'hvc1.fake';
const AVC = 'avc1.fake';

const fixture: { x5Bytes: Uint8Array } = { x5Bytes: new Uint8Array() };

beforeAll(async () => {
  fixture.x5Bytes = await fetchBytes(X5_RECORDING_URL);
});

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
    proxy: undefined,
    shouldDiscoverProxy: false,
    quality: 'auto',
    ...overrides,
  };
}

function packedProxyTrack(): FakeVideoTrack {
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
 * The X5 fixture at the main URL with two HEVC-labelled lens tracks, and its proxy as a packed
 * H.264 track, both served from memory.
 */
function x5World(): World {
  const opener = new MapSourceOpener();
  const main = opener.register(MAIN_URL, fixture.x5Bytes);
  const proxy = opener.register(PROXY_URL, fixture.x5Bytes);
  const demuxer = new FakeDemuxer([
    { source: main, duration: seconds(3), videoTracks: squareTracks({ codec: HEVC }) },
    { source: proxy, duration: seconds(3), videoTracks: [packedProxyTrack()] },
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
      isProxy: false,
      proxyName: undefined,
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
    const bytes = syntheticRecordingBytes({ info: minimalInfoRecord({ model: 'Insta360 X3' }) });
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

  it('reports an undecodable recording with the probe verdicts when there is no proxy', async () => {
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

  it('falls back to the given proxy when the recording cannot be decoded and quality is auto', async () => {
    const world = x5World();
    const ports = fakePorts({
      sources: world.opener,
      demuxer: world.demuxer,
      decoderPort: new FakeVideoDecoderPort({ unsupportedCodecs: [HEVC] }),
    });

    const opened = await openRecording(
      sourceOf({ proxy: { url: PROXY_URL } }),
      ports,
      new AbortController().signal,
    );

    expect(opened.layout.kind).toBe('packed');
    expect(opened.metadata.isProxy).toBe(true);
    expect(opened.metadata.proxyName).toBe('LRV_20260814_132640_01_013.lrv');
    expect(opened.warnings[0]).toMatch(/^playing the proxy: this browser cannot decode/u);
    expect(world.demuxer.openCount).toBe(1);
  });

  it('does not fall back when quality is full', async () => {
    const world = x5World();
    const ports = fakePorts({
      sources: world.opener,
      demuxer: world.demuxer,
      decoderPort: new FakeVideoDecoderPort({ unsupportedCodecs: [HEVC] }),
    });
    await expect(
      openRecording(
        sourceOf({ proxy: { url: PROXY_URL }, quality: 'full' }),
        ports,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'codec-unsupported' });
  });

  it('prefers the proxy when quality is proxy, and says so when there is none', async () => {
    const world = x5World();
    const ports = fakePorts({ sources: world.opener, demuxer: world.demuxer });

    const proxied = await openRecording(
      sourceOf({ proxy: { url: PROXY_URL }, quality: 'proxy' }),
      ports,
      new AbortController().signal,
    );
    expect(proxied.metadata.isProxy).toBe(true);
    expect(proxied.warnings).toEqual(['exposure-record unavailable']);

    const unproxied = await openRecording(
      sourceOf({ quality: 'proxy' }),
      ports,
      new AbortController().signal,
    );
    expect(unproxied.metadata.isProxy).toBe(false);
    expect(unproxied.warnings[0]).toMatch(/^no proxy was given or found/u);
  });

  it('finds the proxy beside a URL when asked and names it without playing it', async () => {
    const world = x5World();
    const ports = fakePorts({
      sources: world.opener,
      demuxer: world.demuxer,
      locator: new FakeResourceLocator([PROXY_URL]),
    });

    const opened = await openRecording(
      sourceOf({ shouldDiscoverProxy: true }),
      ports,
      new AbortController().signal,
    );

    expect(opened.metadata.isProxy).toBe(false);
    expect(opened.metadata.proxyName).toBe('LRV_20260814_132640_01_013.lrv');
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
