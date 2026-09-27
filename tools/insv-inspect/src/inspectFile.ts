import { FileRandomAccessSource } from '@gyroview/adapter-node';
import { inspectRecording } from '@gyroview/core';

import type { Inspection } from './Inspection';

/**
 * Reads a recording from disk and condenses it into an {@link Inspection}.
 */
export async function inspectFile(file: string): Promise<Inspection> {
  const source = await FileRandomAccessSource.open(file);
  try {
    const inspection = await inspectRecording(source);
    return { file, ...inspection };
  } finally {
    await source.close();
  }
}
