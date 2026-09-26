import { RecordingFileName } from '@gyroview/core';

import type { SampleFolderListing } from './samplesListing';

export interface SampleRecording {
  readonly label: string;
  readonly url: string;
}

const RECORDING_EXTENSION = '.insv';

/**
 * The recordings among the listed files; the camera's low-resolution proxies are not offered.
 */
export function sampleRecordingsOf(listings: readonly SampleFolderListing[]): SampleRecording[] {
  return listings.flatMap((listing) =>
    listing.files
      .filter((file) => isRecording(file.name))
      .map((file) => ({
        label: `${listing.folder}/${file.name}`,
        url: file.url,
      })),
  );
}

function isRecording(name: string): boolean {
  const isInsv = name.toLowerCase().endsWith(RECORDING_EXTENSION);
  return isInsv && RecordingFileName.parse(name)?.isProxy !== true;
}
