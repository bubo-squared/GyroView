/**
 * Where the dev server lists the local sample folders, and what it answers there: the one place
 * both the server's plugin and the developer page read the contract from.
 */
export const SAMPLES_ENDPOINT = '/samples.json';

/**
 * One folder of local files, each with the URL the dev server serves it at.
 */
export interface SampleFolderListing {
  readonly folder: string;
  readonly files: readonly { readonly name: string; readonly url: string }[];
}
