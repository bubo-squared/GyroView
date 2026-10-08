import { beforeAll, describe, expect, it } from 'vitest';

import { readRecordingFiles, type RecordingFile } from './readRecordingFiles';
import { readSampleTable } from './readSampleTable';
import { UNSPECIFIED_COLOUR } from '../../domain/colour/TrackColour';
import { CalibrationVersion } from '../../domain/format/calibration/CalibrationVersion';
import { InfoRecordFormat, RecordType } from '../../domain/format/constants';
import { InfoField } from '../../domain/format/info/infoFields';
import type { CodecReader, ContainerCodecs } from '../../ports/CodecReader';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { FakeCodecReader } from '../../testing/FakeCodecReader';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { minimalInfoFields, minimalInfoRecord } from '../../testing/minimalInfoRecord';
import { lensMp4File } from '../../testing/mp4/lensMp4File';
import { encodeProtobuf, stringField } from '../../testing/protobufWriter';
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

const SQUARE = { codedWidth: LENS_SIZE, codedHeight: LENS_SIZE };

/**
 * The codecs of a file's lens tracks, square unless another size is given.
 */
function lensCodecs(
  lenses: number,
  size: { readonly codedWidth: number; readonly codedHeight: number } = SQUARE,
): ContainerCodecs {
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
 * A file of the given tracks that ends with a trailer holding only an info record.
 */
function withTrailer(
  tracks: Uint8Array,
  info: Uint8Array,
  format: number = InfoRecordFormat.Protobuf,
): Uint8Array {
  return new TrailerFixtureBuilder()
    .withPrefix(tracks)
    .addRecord({ id: RecordType.Info, format, payload: info })
    .buildIndexed({ alignment: 64, wrapInInstBox: true }).bytes;
}

/**
 * The half an info record calls split, with no calibration: opening it stops once its layout is
 * known.
 */
function declaredSplitHalf(name: string): ServedFile {
  const info = minimalInfoRecord({ model: 'Insta360 X3', fileLayout: SPLIT_FILES });
  return served(name, withTrailer(lensMp4File({ lenses: 1 }).bytes, info), 1);
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

/**
 * A look for the other lens file whose server never answered it.
 */
function unansweredLook(): Promise<RecordingFile | undefined> {
  return Promise.reject(new GyroViewError('source-unreadable', 'the server answered 503'));
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

  it('refuses a recording without calibration, which cannot be stitched, naming what it skipped', async () => {
    const fields = [
      ...minimalInfoFields({ model: 'Insta360 X3' }),
      stringField(InfoField.Offset, '2_1_2_3'),
    ];
    const bytes = withTrailer(lensMp4File({ lenses: 2 }).bytes, encodeProtobuf(fields));
    const uncalibrated = served(BACK_NAME, bytes, 2);
    const reader = await codecReaderOf([uncalibrated]);

    await expect(
      readRecordingFiles([uncalibrated.file], { codecReader: reader }),
    ).rejects.toMatchObject({
      code: 'no-calibration',
      message: expect.stringContaining('(offset skipped:') as string,
    });
  });

  it('refuses no files at all as a mistake of its caller', async () => {
    await expect(readRecordingFiles([], { codecReader })).rejects.toMatchObject({
      code: 'invariant-violation',
    });
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

  it('fails with the look for the other lens file, not as a missing file, when the look itself failed', async () => {
    const declaredSplit = readRecordingFiles([files.declared.file], {
      codecReader,
      findSecondFile: unansweredLook,
    });
    await expect(declaredSplit).rejects.toMatchObject({ code: 'source-unreadable' });

    const fallingShort = readRecordingFiles([files.x5Back.file], {
      codecReader: await codecReaderOf([files.x5Back]),
      findSecondFile: unansweredLook,
    });
    await expect(fallingShort).rejects.toMatchObject({ code: 'source-unreadable' });
  });

  it('asks for nothing beside a pair given whole, even one its info record calls split', async () => {
    const finder = new SecondFileFinder(undefined);
    const reader = await codecReaderOf([files.declared, files.bareScreen]);

    // The minimal info record carries no calibration: opening stops once the layout is known.
    const failure = await captureRejection(
      readRecordingFiles([files.declared.file, files.bareScreen.file], {
        codecReader: reader,
        findSecondFile: finder.find,
      }),
    );

    expect(failure).toMatchObject({ code: 'no-calibration' });
    expect(finder.asked).toBe(0);
  });

  it('reports a half its info record calls split as such where there is nothing to look for', async () => {
    await expect(readRecordingFiles([files.declared.file], { codecReader })).rejects.toMatchObject({
      code: 'missing-second-file',
    });
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

  it('lets the names decide a pair whose files both carry a trailer', async () => {
    const screen = x5Half(SCREEN_NAME);
    const back = x5Half(BACK_NAME);
    const reader = await codecReaderOf([screen, back]);

    const read = await readRecordingFiles([screen.file, back.file], { codecReader: reader });

    expect(read.files.map((file) => file.hasTrailer)).toEqual([true, true]);
    expect(read.layout.sources.map((source) => source.inputIndex)).toEqual([1, 0]);
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

  it('calls a file without a trailer damaged when its tracks fit no layout at all', async () => {
    const wide = { codedWidth: 1920, codedHeight: 1080 };
    const notALens = {
      file: {
        name: BACK_NAME,
        source: new InMemoryRandomAccessSource(lensMp4File({ lenses: 1, frames: 20 }).bytes),
      },
      codecs: lensCodecs(1, wide),
    };
    const reader = await codecReaderOf([notALens]);

    await expect(
      readRecordingFiles([notALens.file], { codecReader: reader }),
    ).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('calls a file without a trailer damaged when it holds no movie either', async () => {
    const noMovie = served(BACK_NAME, new Uint8Array(200), 1);

    await expect(readRecordingFiles([noMovie.file], { codecReader })).rejects.toMatchObject({
      code: 'invalid-trailer',
    });
  });

  it('reads no second file when the first fails for another reason than a missing trailer', async () => {
    const json = withTrailer(
      lensMp4File({ lenses: 1 }).bytes,
      new TextEncoder().encode('{}'),
      InfoRecordFormat.Json,
    );
    const unreadable = served(BACK_NAME, json, 1);

    await expect(
      readRecordingFiles([unreadable.file, files.x5Back.file], { codecReader }),
    ).rejects.toMatchObject({ code: 'unsupported-info-format' });
  });
});
