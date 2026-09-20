import { RecordingFileName } from '@gyroview/core';

/**
 * One folder of local files as the dev server lists it.
 */
export interface SampleFolderListing {
  readonly folder: string;
  readonly files: readonly { readonly name: string; readonly url: string }[];
}

export interface SampleRecording {
  readonly label: string;
  readonly url: string;
  readonly proxyUrl: string | undefined;
}

const RECORDING_EXTENSION = '.insv';

/**
 * The recordings among the listed files, each with the camera's proxy when it sits beside it.
 * Proxies themselves are not offered: the player finds them by itself.
 */
export function sampleRecordingsOf(listings: readonly SampleFolderListing[]): SampleRecording[] {
  return listings.flatMap((listing) =>
    listing.files
      .filter((file) => isRecording(file.name))
      .map((file) => ({
        label: `${listing.folder}/${file.name}`,
        url: file.url,
        proxyUrl: proxyUrlOf(file.name, listing),
      })),
  );
}

function isRecording(name: string): boolean {
  const isInsv = name.toLowerCase().endsWith(RECORDING_EXTENSION);
  return isInsv && RecordingFileName.parse(name)?.isProxy !== true;
}

function proxyUrlOf(name: string, listing: SampleFolderListing): string | undefined {
  const proxyName = RecordingFileName.parse(name)?.proxyName();
  return listing.files.find((file) => file.name === proxyName)?.url;
}
