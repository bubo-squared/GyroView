import type { RecordingInspection } from '@gyroview/core';

/**
 * A recording inspected on disk: what the core read from it, and the path it was read from.
 */
export interface Inspection extends RecordingInspection {
  readonly file: string;
}
