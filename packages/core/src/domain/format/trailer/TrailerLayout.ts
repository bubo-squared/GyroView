import type { RecordHeader } from './RecordHeader';
import type { TrailerFooter } from './TrailerFooter';

/**
 * What the reader knows after reading the last bytes of the file: enough for a
 * record locator to find every record.
 */
export interface TrailerLayout {
  readonly fileSize: number;
  readonly payloadStart: number;
  readonly footer: TrailerFooter;
  /**
   * Header of the record closest to the footer. It is the index record when one exists.
   */
  readonly lastHeader: RecordHeader;
}
