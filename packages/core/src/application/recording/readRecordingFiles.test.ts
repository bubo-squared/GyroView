import { beforeAll, describe, expect, it } from 'vitest';

import { readRecordingFiles, type RecordingFile } from './readRecordingFiles';
import { readSampleTable } from './readSampleTable';
import { UNSPECIFIED_COLOUR } from '../../domain/colour/TrackColour';
import { CalibrationVersion } from '../../domain/format/calibration/CalibrationVersion';
import { InfoRecordFormat, RecordType } from '../../domain/format/constants';
import type { CodecReader, ContainerCodecs } from '../../ports/CodecReader';
import { FakeCodecReader } from '../../testing/FakeCodecReader';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { minimalInfoRecord } from '../../testing/minimalInfoRecord';
import { lensMp4File } from '../../testing/mp4/lensMp4File';
import { TrailerFixtureBuilder } from '../../testing/TrailerFixtureBuilder';
import { loadFixture } from '../../../test/support/fixtures';

const BACK_NAME = 'VID_20260814_132640_00_013.insv';
const SCREEN_NAME = 'VID_20260814_132640_10_013.insv';
const LENS_SIZE = 64;
/**
 * The info record's file layout value for a recording split into one file per lens.
 */
const SPLIT_FILES = 1;
const X5_BYTES = loadFixture('synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4');

/**
 * A file of the recording, and the codecs the codec reader tells of it.
 */
interface ServedFile {
  readonly file: RecordingFile;
  readonly codecs: ContainerCodecs;
}

/**
 * The codecs of a file's square lens tracks.
 */
function lensCodecs(lenses: number): ContainerCodecs {
  const size = { codedWidth: LENS_SIZE, codedHeight: LENS_SIZE };
  const video = Array.from({ length: lenses }, (_, trackIndex) => ({
    trackId: trackIndex + 1,
    description: { trackIndex, codec: 'avc1.fake', ...size, colour: UNSPECIFIED_COLOUR },
    configuration: {
      codec: 'avc1.fake',
      ...size,
      description: undefined,
      colour: UNSPECIFIED_COLOUR,
    },
  }));
  return { video, audio: [] };
}

function served(name: string | undefined, bytes: Uint8Array, lenses: number): ServedFile {
  return {
    file: { name, source: new InMemoryRandomAccessSource(bytes) },
    codecs: lensCodecs(lenses),
  };
}

/**
 * The X5 fixture, both lens tracks told.
 */
function x5(name: string | undefined = BACK_NAME): ServedFile {
  return served(name, X5_BYTES, 2);
}

/**
 * The X5 fixture read as one lens of a split pair: its first track alone is told.
 */
function x5Half(name: string | undefined): ServedFile {
  return served(name, X5_BYTES, 1);
}

/**
 * One lens file without a trailer, as the _10_ file of an older camera's pair is.
 */
function bareHalf(name: string | undefined, frames?: number): ServedFile {
  const spec = frames === undefined ? { lenses: 1 } : { lenses: 1, frames };
  return served(name, lensMp4File(spec).bytes, 1);
}

/**
 * The half an info record calls split, with no calibration: opening it stops once its layout is
 * known.
 */
function declaredSplitHalf(name: string): ServedFile {
  const info = minimalInfoRecord({ model: 'Insta360 X3', fileLayout: SPLIT_FILES });
  const bytes = new TrailerFixtureBuilder()
    .withPrefix(lensMp4File({ lenses: 1 }).bytes)
    .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
    .buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
  return served(name, bytes, 1);
}

/**
 * A codec reader that tells each file's codecs, and counts the movies it is handed.
 */
class CountingCodecReader implements CodecReader {
  public movies = 0;

  public constructor(private readonly reader: CodecReader) {}

  public read(movieBytes: Uint8Array): Promise<ContainerCodecs> {
    this.movies += 1;
    return this.reader.read(movieBytes);
  }
}

async function codecReaderOf(files: readonly ServedFile[]): Promise<CountingCodecReader> {
  const registrations = await Promise.all(
    files.map(async ({ file, codecs }) => {
      const { movieBytes } = await readSampleTable(file.source);
      return [movieBytes, codecs] as const;
    }),
  );
  return new CountingCodecReader(new FakeCodecReader(registrations));
}

/**
 * Finds `second` when asked, and counts how often it was asked.
 */
class SecondFileFinder {
  public asked = 0;

  public constructor(private readonly second: RecordingFile | undefined) {}

  public readonly find = (): Promise<RecordingFile | undefined> => {
    this.asked += 1;
    return Promise.resolve(this.second);
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('readRecordingFiles', () => {
  let codecReader: CountingCodecReader;
  const files = {
    x5: x5(),
    x5Back: x5Half(BACK_NAME),
    bareScreen: bareHalf(SCREEN_NAME),
    shortScreen: bareHalf(SCREEN_NAME, 25),
    declared: declaredSplitHalf(BACK_NAME),
    twoLensesNoTrailer: served(BACK_NAME, lensMp4File({ lenses: 2 }).bytes, 2),
  };

  beforeAll(async () => {
    codecReader = await codecReaderOf([
      files.x5,
      files.bareScreen,
      files.shortScreen,
      files.declared,
      files.twoLensesNoTrailer,
    ]);
  });

  it('reads a one-file X5 recording: its metadata, layout, calibration and duration', async () => {
    const read = await readRecordingFiles([files.x5.file], { codecReader });

    expect(read.recording.info.model).toBe('Insta360 X5');
    expect(read.layout.kind).toBe('multi-track');
    // The X5 info record says track 0 is the screen-side lens, so lens 0 is track 1.
    expect(read.layout.sources.map((source) => source.trackIndex)).toEqual([1, 0]);
    expect(read.calibration.version).toBe(CalibrationVersion.Legacy);
    expect(read.duration).toBeCloseTo(3, 6);
    expect(read.files.map((file) => file.name)).toEqual([BACK_NAME]);
  });

  it('hands back the files it was given, with what it read of them', async () => {
    const given = { ...files.x5.file, stream: 'kept beside the source' };

    const read = await readRecordingFiles([given], { codecReader });

    expect(read.files[0]?.stream).toBe('kept beside the source');
    expect(read.files[0]?.table.videoTracks).toHaveLength(2);
    expect(read.files[0]?.size).toBe(X5_BYTES.byteLength);
  });

  it('asks for nothing beside a recording that opens by itself', async () => {
    const finder = new SecondFileFinder(undefined);

    await readRecordingFiles([files.x5.file], { codecReader, findSecondFile: finder.find });

    expect(finder.asked).toBe(0);
  });

  it('refuses a recording without calibration, which cannot be stitched', async () => {
    const info = minimalInfoRecord({ model: 'Insta360 X3' });
    const bytes = new TrailerFixtureBuilder()
      .withPrefix(lensMp4File({ lenses: 2 }).bytes)
      .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: info })
      .buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
    const uncalibrated = served(BACK_NAME, bytes, 2);
    const reader = await codecReaderOf([uncalibrated]);

    await expect(
      readRecordingFiles([uncalibrated.file], { codecReader: reader }),
    ).rejects.toMatchObject({ code: 'no-calibration' });
  });

  it('finds the other lens file before reading the tracks when the info record says the recording is split', async () => {
    const finder = new SecondFileFinder(files.bareScreen.file);
    const reader = await codecReaderOf([files.declared, files.bareScreen]);

    // The minimal info record carries no calibration: opening stops once the layout is known.
    const failure = await captureRejection(
      readRecordingFiles([files.declared.file], {
        codecReader: reader,
        findSecondFile: finder.find,
      }),
    );

    expect(failure).toMatchObject({ code: 'no-calibration' });
    expect(reader.movies).toBe(2);
    expect(finder.asked).toBe(1);
  });

  it('asks for the other lens file once when the info record calls the recording split and it is not there', async () => {
    const finder = new SecondFileFinder(undefined);

    const failure = await captureRejection(
      readRecordingFiles([files.declared.file], { codecReader, findSecondFile: finder.find }),
    );

    expect(failure).toMatchObject({ code: 'missing-second-file' });
    expect(finder.asked).toBe(1);
  });

  it('fetches the other lens file once the tracks of a lone half fall short, and plays as long as the shorter', async () => {
    const finder = new SecondFileFinder(files.shortScreen.file);
    const reader = await codecReaderOf([files.x5Back, files.shortScreen]);

    const read = await readRecordingFiles([files.x5Back.file], {
      codecReader: reader,
      findSecondFile: finder.find,
    });

    expect(read.layout.kind).toBe('split-files');
    expect(read.files.map((file) => file.name)).toEqual([BACK_NAME, SCREEN_NAME]);
    expect(read.duration).toBeCloseTo(2.5, 6);
  });

  it('reports a lone half of a pair when the other lens file is not there', async () => {
    const reader = await codecReaderOf([files.x5Back]);
    const finder = new SecondFileFinder(undefined);

    await expect(
      readRecordingFiles([files.x5Back.file], { codecReader: reader, findSecondFile: finder.find }),
    ).rejects.toMatchObject({ code: 'missing-second-file' });
    expect(finder.asked).toBe(1);
  });

  it('reads the trailer from the second file when the first, the _10_ half, has none', async () => {
    const reader = await codecReaderOf([files.bareScreen, files.x5Back]);

    const read = await readRecordingFiles([files.bareScreen.file, files.x5Back.file], {
      codecReader: reader,
    });

    expect(read.recording.info.model).toBe('Insta360 X5');
    expect(read.layout.kind).toBe('split-files');
    expect(read.layout.sources.map((source) => source.inputIndex)).toEqual([1, 0]);
  });

  it('takes lens 0 from the file that carries the trailer, whatever the files are called', async () => {
    const opaqueScreen = bareHalf('media/a1b2.insv');
    const opaqueBack = x5Half('media/c3d4.insv');
    const reader = await codecReaderOf([opaqueScreen, opaqueBack]);

    const read = await readRecordingFiles([opaqueScreen.file, opaqueBack.file], {
      codecReader: reader,
    });

    expect(read.layout.sources.map((source) => [source.lensIndex, source.inputIndex])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(read.files.map((file) => file.hasTrailer)).toEqual([false, true]);
    expect(read.layout.evidence).toContain(
      'lens 0 taken from the file that carries the trailer (media/c3d4.insv)',
    );
  });

  it('asks for the other file of a lone _10_ file without a trailer, not calling it damaged', async () => {
    await expect(
      readRecordingFiles([files.bareScreen.file], { codecReader }),
    ).rejects.toMatchObject({ code: 'missing-second-file' });
  });

  it('fetches the _00_ file for a lone _10_ file that has no trailer', async () => {
    const finder = new SecondFileFinder(files.x5Back.file);
    const reader = await codecReaderOf([files.bareScreen, files.x5Back]);

    const read = await readRecordingFiles([files.bareScreen.file], {
      codecReader: reader,
      findSecondFile: finder.find,
    });

    expect(read.layout.kind).toBe('split-files');
    expect(read.recording.info.model).toBe('Insta360 X5');
  });

  it('calls a file without a trailer damaged when its tracks are no half of a pair', async () => {
    await expect(
      readRecordingFiles([files.twoLensesNoTrailer.file], { codecReader }),
    ).rejects.toMatchObject({ code: 'invalid-trailer' });
  });
});
