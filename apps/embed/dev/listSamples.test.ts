import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listSampleFolders } from './listSamples';

const directories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  directories.push(directory);
  return realpath(directory);
}

describe('listSampleFolders', () => {
  let root: string;
  let target: string;

  beforeAll(async () => {
    root = await temporaryDirectory('gyroview-samples-');
    target = await temporaryDirectory('gyroview-sample-target-');
    await writeFile(path.join(target, 'VID_20260814_132640_00_013.insv'), '');
    await writeFile(path.join(target, 'LRV_20260814_132640_01_013.lrv'), '');
    await symlink(target, path.join(root, 'office'));
    await mkdir(path.join(root, 'empty'));
    await writeFile(path.join(root, 'stray.insv'), '');
  });

  afterAll(async () => {
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('lists every folder through symlinks with its files, ignoring loose files', async () => {
    await expect(listSampleFolders(root)).resolves.toEqual([
      { folder: 'empty', files: [] },
      {
        folder: 'office',
        files: [
          {
            name: 'LRV_20260814_132640_01_013.lrv',
            realPath: path.join(target, 'LRV_20260814_132640_01_013.lrv'),
          },
          {
            name: 'VID_20260814_132640_00_013.insv',
            realPath: path.join(target, 'VID_20260814_132640_00_013.insv'),
          },
        ],
      },
    ]);
  });

  it('lists nothing for a root that does not exist', async () => {
    await expect(listSampleFolders(path.join(root, 'missing'))).resolves.toEqual([]);
  });
});
