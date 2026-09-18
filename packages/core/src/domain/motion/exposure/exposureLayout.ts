/**
 * Exposure record (id 4): one 16-byte entry per captured frame, u64 LE capture-clock timestamp in
 * microseconds followed by float64 LE exposure time in seconds. Source: X5 recordings; entries
 * begin a few frames before `first_frame_timestamp` and end a few frames after the last encoded
 * frame.
 */
export const EXPOSURE_ENTRY_SIZE = 16;
export const EXPOSURE_TIMESTAMP_OFFSET = 0;
export const EXPOSURE_DURATION_OFFSET = 8;
