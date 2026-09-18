import type { RecordLocation } from './RecordLocation';
import type { TrailerLayout } from './TrailerLayout';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';

/**
 * Strategy for finding record payloads. Newer firmware writes an index record; older firmware
 * writes records back to back, so they must be walked from the footer backwards.
 */
export interface RecordLocator {
  locate(source: RandomAccessSource, layout: TrailerLayout): Promise<readonly RecordLocation[]>;
}
