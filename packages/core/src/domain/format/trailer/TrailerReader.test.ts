import { describe, expect, it } from 'vitest';

import { TrailerReader } from './TrailerReader';
import { RecordType, TRAILER_FOOTER_SIZE } from '../constants';
import { InMemoryRandomAccessSource } from '../../../testing/InMemoryRandomAccessSource';
import { SparseRandomAccessSource } from '../../../testing/SparseRandomAccessSource';
import { TrailerFixtureBuilder } from '../../../../test/support/TrailerFixtureBuilder';
import { loadFixture, loadManifest } from '../../../../test/support/fixtures';

const manifest = loadManifest();
const reader = new TrailerReader();
const INFO_PAYLOAD = Uint8Array.from({ length: 300 }, (_value, index) => index);
const GYRO_PAYLOAD = new Uint8Array(1000).fill(0xab);
const EXPOSURE_PAYLOAD = new Uint8Array(64).fill(0xcd);

function realFileStandIn(sample: 'office' | 'sailing'): SparseRandomAccessSource {
  const entry = manifest[sample];
  return new SparseRandomAccessSource(entry.fileSize)
    .place(entry.indexOffset, loadFixture(`x5/${sample}/footer-with-index.bin`))
    .place(entry.records['1']!.offset, loadFixture(`x5/${sample}/record-01-info.bin`));
}

function syntheticRecords(): TrailerFixtureBuilder {
  return new TrailerFixtureBuilder()
    .withPrefix(new Uint8Array([0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]))
    .addRecord({ id: RecordType.Info, format: 1, payload: INFO_PAYLOAD })
    .addRecord({ id: RecordType.Gyro, payload: GYRO_PAYLOAD })
    .addRecord({ id: RecordType.Exposure, payload: EXPOSURE_PAYLOAD });
}

describe('TrailerReader with the real X5 layout', () => {
  it.each(['office', 'sailing'] as const)(
    'finds every record of the %s recording at its true offset',
    async (sample) => {
      const trailer = await reader.read(realFileStandIn(sample));

      const entry = manifest[sample];
      expect(trailer.payloadStart).toBe(entry.payloadStart);
      expect(trailer.footer.version).toBe(entry.trailerVersion);
      expect(trailer.recordIds.toSorted((left, right) => left - right)).toEqual(
        Object.keys(entry.records).map(Number),
      );
      expect(trailer.locationOf(RecordType.Info)?.payload.offset).toBe(entry.records['1']!.offset);
      expect(trailer.locationOf(RecordType.Gyro)?.payload.length).toBe(entry.records['3']!.size);
    },
  );

  it('reads the info record payload back', async () => {
    const source = realFileStandIn('office');
    const trailer = await reader.read(source);
    const info = await trailer.readRecord(source, RecordType.Info);
    expect(info).toEqual(loadFixture('x5/office/record-01-info.bin'));
  });

  it('needs only two reads to build the table of contents', async () => {
    const source = realFileStandIn('office');
    await reader.read(source);
    expect(source.reads).toHaveLength(2);
    expect(source.reads[0]!.end).toBe(manifest.office.fileSize);
    expect(source.reads[1]!.offset).toBe(manifest.office.indexOffset);
  });
});

describe('TrailerReader with synthetic layouts', () => {
  it('locates records through the index when one is present', async () => {
    const file = syntheticRecords().buildIndexed(4096);
    const source = new InMemoryRandomAccessSource(file.bytes);

    const trailer = await reader.read(source);

    expect(trailer.payloadStart).toBe(file.payloadStart);
    for (const expected of file.records) {
      expect(trailer.locationOf(expected.id)?.payload).toMatchObject({
        offset: expected.offset,
        length: expected.size,
      });
    }
    expect(await trailer.readRecord(source, RecordType.Exposure)).toEqual(EXPOSURE_PAYLOAD);
  });

  it('walks contiguous records backwards when there is no index', async () => {
    const file = syntheticRecords().buildContiguous();
    const source = new InMemoryRandomAccessSource(file.bytes);

    const trailer = await reader.read(source);

    expect(trailer.has(RecordType.Index)).toBe(false);
    expect(trailer.recordIds).toEqual([RecordType.Info, RecordType.Gyro, RecordType.Exposure]);
    for (const expected of file.records) {
      expect(trailer.locationOf(expected.id)).toMatchObject({
        format: expected.format,
        payload: { offset: expected.offset, length: expected.size },
      });
    }
    expect(await trailer.readRecord(source, RecordType.Info)).toEqual(INFO_PAYLOAD);
  });

  it('rejects a file too small to hold a trailer', async () => {
    const tooSmall = new InMemoryRandomAccessSource(new Uint8Array(10));
    await expect(reader.read(tooSmall)).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('rejects a file that does not end with the magic', async () => {
    const noMagic = new InMemoryRandomAccessSource(new Uint8Array(200));
    await expect(reader.read(noMagic)).rejects.toMatchObject({ code: 'invalid-trailer' });
  });

  it('rejects a footer that claims a trailer larger than the file', async () => {
    const file = syntheticRecords().buildContiguous();
    const view = new DataView(file.bytes.buffer, file.bytes.byteOffset);
    view.setUint32(
      file.bytes.byteLength - TRAILER_FOOTER_SIZE + 32,
      file.bytes.byteLength + 1,
      true,
    );
    const expectedError = {
      code: 'invalid-trailer',
      message: expect.stringContaining('exceeds file size') as string,
    };
    await expect(reader.read(new InMemoryRandomAccessSource(file.bytes))).rejects.toMatchObject(
      expectedError,
    );
  });

  it('reports a missing record with a typed error', async () => {
    const file = syntheticRecords().buildContiguous();
    const source = new InMemoryRandomAccessSource(file.bytes);
    const trailer = await reader.read(source);
    const expectedError = { code: 'record-not-found' };
    await expect(trailer.readRecord(source, RecordType.Gps)).rejects.toMatchObject(expectedError);
  });
});
