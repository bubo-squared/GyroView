import { describe, expect, it } from 'vitest';

import { readTrailer as readTrailerWithSize } from './readTrailer';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import {
  FOOTER_TRAILER_SIZE_OFFSET,
  INDEX_SLOT_OFFSET_OFFSET,
  INDEX_SLOT_SIZE,
  InfoRecordFormat,
  RECORD_HEADER_SIZE,
  RECORD_HEADER_SIZE_OFFSET,
  RecordType,
  TRAILER_FOOTER_SIZE,
} from '../constants';
import { InMemoryRandomAccessSource } from '../../../testing/InMemoryRandomAccessSource';
import { SparseRandomAccessSource } from '../../../testing/SparseRandomAccessSource';
import { TrailerFixtureBuilder } from '../../../testing/TrailerFixtureBuilder';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();
const INFO_PAYLOAD = Uint8Array.from({ length: 300 }, (_value, index) => index);
const GYRO_PAYLOAD = new Uint8Array(1000).fill(0xab);
const EXPOSURE_PAYLOAD = new Uint8Array(64).fill(0xcd);

async function readTrailer(source: RandomAccessSource): ReturnType<typeof readTrailerWithSize> {
  return readTrailerWithSize(source, await source.size());
}

function realFileStandIn(sample: 'office' | 'sailing'): SparseRandomAccessSource {
  const entry = manifest[sample];
  return new SparseRandomAccessSource(entry.fileSize)
    .place(entry.indexOffset, loadFixture(`x5/${sample}/footer-with-index.bin`))
    .place(entry.records['1']!.offset, loadFixture(`x5/${sample}/record-01-info.bin`));
}

function syntheticRecords(): TrailerFixtureBuilder {
  return new TrailerFixtureBuilder()
    .withPrefix(new Uint8Array([0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]))
    .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: INFO_PAYLOAD })
    .addRecord({ id: RecordType.Gyro, payload: GYRO_PAYLOAD })
    .addRecord({ id: RecordType.Exposure, payload: EXPOSURE_PAYLOAD });
}

function footerSizeFieldOffset(fileSize: number): number {
  return fileSize - TRAILER_FOOTER_SIZE + FOOTER_TRAILER_SIZE_OFFSET;
}

describe('readTrailer with the real X5 layout', () => {
  it.each(['office', 'sailing'] as const)(
    'finds every record of the %s recording at its true offset',
    async (sample) => {
      const trailer = await readTrailer(realFileStandIn(sample));

      const entry = manifest[sample];
      expect(trailer.payloadStart).toBe(entry.payloadStart);
      expect(trailer.footer.version).toBe(entry.trailerVersion);
      expect(trailer.records.map((record) => record.id).toSorted((a, b) => a - b)).toEqual(
        Object.keys(entry.records).map(Number),
      );
      expect(trailer.locationOf(RecordType.Info)?.payload.offset).toBe(entry.records['1']!.offset);
      expect(trailer.locationOf(RecordType.Gyro)?.payload.length).toBe(entry.records['3']!.size);
    },
  );

  it('needs only two reads to build the table of contents', async () => {
    const source = realFileStandIn('office');
    await readTrailer(source);
    expect(source.reads).toHaveLength(2);
    expect(source.reads[0]!.end).toBe(manifest.office.fileSize);
    expect(source.reads[1]!.offset).toBe(manifest.office.indexOffset);
  });
});

describe('readTrailer with synthetic layouts', () => {
  it('locates records through the index when one is present', async () => {
    const file = syntheticRecords().buildIndexed({ alignment: 4096 });
    const trailer = await readTrailer(new InMemoryRandomAccessSource(file.bytes));
    expect(trailer.payloadStart).toBe(file.payloadStart);
    for (const expected of file.records) {
      expect(trailer.locationOf(expected.id)?.payload).toMatchObject({
        offset: expected.offset,
        length: expected.size,
      });
    }
  });

  it('accepts an indexed record that starts exactly at the payload start', async () => {
    const file = syntheticRecords().buildIndexed({ alignment: 1 });
    const trailer = await readTrailer(new InMemoryRandomAccessSource(file.bytes));
    expect(trailer.locationOf(RecordType.Info)?.payload.offset).toBe(file.payloadStart);
  });

  it('rejects an index slot pointing outside the trailer', async () => {
    const file = syntheticRecords().buildIndexed({ alignment: 4096 });
    const indexStart =
      file.bytes.byteLength - TRAILER_FOOTER_SIZE - RECORD_HEADER_SIZE - file.indexSize;
    const infoSlot = indexStart + RecordType.Info * INDEX_SLOT_SIZE;
    new DataView(file.bytes.buffer, file.bytes.byteOffset).setUint32(
      infoSlot + INDEX_SLOT_OFFSET_OFFSET,
      file.bytes.byteLength,
      true,
    );
    const expectedError = {
      code: 'invalid-trailer',
      message: expect.stringContaining('outside the trailer') as string,
    };
    await expect(readTrailer(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject(
      expectedError,
    );
  });

  it('rejects an index record whose size runs past the trailer start, reading none of it', async () => {
    const file = syntheticRecords().buildIndexed({ alignment: 4096 });
    const indexHeader = file.bytes.byteLength - TRAILER_FOOTER_SIZE - RECORD_HEADER_SIZE;
    new DataView(file.bytes.buffer, file.bytes.byteOffset).setUint32(
      indexHeader + RECORD_HEADER_SIZE_OFFSET,
      0xff_ff_ff_ff,
      true,
    );
    await expect(readTrailer(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject({
      code: 'invalid-trailer',
    });
  });

  it('walks contiguous records backwards when there is no index', async () => {
    const file = syntheticRecords().buildContiguous();
    const trailer = await readTrailer(new InMemoryRandomAccessSource(file.bytes));
    expect(trailer.locationOf(RecordType.Index)).toBeUndefined();
    expect(trailer.records.map((record) => record.id)).toEqual([
      RecordType.Info,
      RecordType.Gyro,
      RecordType.Exposure,
    ]);
    for (const expected of file.records) {
      expect(trailer.locationOf(expected.id)).toMatchObject({
        format: expected.format,
        payload: { offset: expected.offset, length: expected.size },
      });
    }
  });

  it('accepts a trailer that spans the whole file', async () => {
    const file = new TrailerFixtureBuilder()
      .addRecord({ id: RecordType.Info, format: InfoRecordFormat.Protobuf, payload: INFO_PAYLOAD })
      .buildContiguous();
    const trailer = await readTrailer(new InMemoryRandomAccessSource(file.bytes));
    expect(trailer.payloadStart).toBe(0);
  });

  it('rejects contiguous records that overrun the declared trailer start', async () => {
    const file = syntheticRecords().buildContiguous();
    const view = new DataView(file.bytes.buffer, file.bytes.byteOffset);
    view.setUint32(footerSizeFieldOffset(file.bytes.byteLength), 200, true);
    const expectedError = {
      code: 'invalid-trailer',
      message: expect.stringContaining('not contiguous') as string,
    };
    await expect(readTrailer(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject(
      expectedError,
    );
  });

  it('rejects a file too small to hold a trailer', async () => {
    const tooSmall = new InMemoryRandomAccessSource(new Uint8Array(10));
    await expect(readTrailer(tooSmall)).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('rejects a file that does not end with the magic', async () => {
    const noMagic = new InMemoryRandomAccessSource(new Uint8Array(200));
    await expect(readTrailer(noMagic)).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('rejects a footer that claims a trailer larger than the file', async () => {
    const file = syntheticRecords().buildContiguous();
    const view = new DataView(file.bytes.buffer, file.bytes.byteOffset);
    view.setUint32(footerSizeFieldOffset(file.bytes.byteLength), file.bytes.byteLength + 1, true);
    const expectedError = {
      code: 'invalid-trailer',
      message: expect.stringContaining('exceeds file size') as string,
    };
    await expect(readTrailer(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject(
      expectedError,
    );
  });
});

describe('Trailer', () => {
  it('knows no location for a record the file lacks', async () => {
    const file = syntheticRecords().buildContiguous();
    const trailer = await readTrailer(new InMemoryRandomAccessSource(file.bytes));
    expect(trailer.locationOf(RecordType.Gps)).toBeUndefined();
    expect(trailer.records).toHaveLength(3);
  });
});
