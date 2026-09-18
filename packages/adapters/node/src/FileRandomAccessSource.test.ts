import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ByteRange } from '@gyroview/core';
import { describeRandomAccessSourceContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { FileRandomAccessSource } from './FileRandomAccessSource';

const directory = await mkdtemp(path.join(tmpdir(), 'gyroview-file-source-'));
const openSources: FileRandomAccessSource[] = [];

async function sourceOver(bytes: Uint8Array): Promise<FileRandomAccessSource> {
  const file = path.join(directory, `fixture-${randomUUID()}.bin`);
  await writeFile(file, bytes);
  const source = await FileRandomAccessSource.open(file);
  openSources.push(source);
  return source;
}

afterAll(async () => {
  await Promise.all(openSources.map((source) => source.close()));
  await rm(directory, { recursive: true, force: true });
});

describeRandomAccessSourceContract(sourceOver);

describe('FileRandomAccessSource', () => {
  it('rejects opening a file that does not exist', async () => {
    await expect(
      FileRandomAccessSource.open(path.join(directory, 'missing.bin')),
    ).rejects.toThrow();
  });

  it('reads a range in the middle of a larger file exactly once through', async () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_value, index) => index % 251);
    const source = await sourceOver(bytes);
    const range = ByteRange.of(65_000, 4000);
    const read = await source.read(range);
    expect(read).toEqual(bytes.subarray(range.offset, range.end));
  });
});
