import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface SampleFile {
  readonly name: string;
  readonly realPath: string;
}

export interface SampleFolder {
  readonly folder: string;
  readonly files: readonly SampleFile[];
}

/**
 * Every folder under the samples root (following symlinks) with the files in it. Which files
 * are recordings and which are proxies is the player's knowledge, decided in the browser; this
 * stays a plain directory listing so the dev server needs nothing but Node.
 */
export async function listSampleFolders(root: string): Promise<SampleFolder[]> {
  const folders = await foldersIn(root);
  const listed = await Promise.all(folders.map((folder) => filesIn(root, folder)));
  return listed.toSorted((left, right) => left.folder.localeCompare(right.folder));
}

async function foldersIn(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root);
    const checks = await Promise.all(entries.map((entry) => isDirectory(path.join(root, entry))));
    return entries.filter((_entry, index) => checks[index] === true);
  } catch {
    return [];
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    const information = await stat(candidate);
    return information.isDirectory();
  } catch {
    return false;
  }
}

async function filesIn(root: string, folder: string): Promise<SampleFolder> {
  const directory = await realpath(path.join(root, folder));
  const names = await readdir(directory);
  return {
    folder,
    files: names
      .toSorted((left, right) => left.localeCompare(right))
      .map((name) => ({ name, realPath: path.join(directory, name) })),
  };
}
