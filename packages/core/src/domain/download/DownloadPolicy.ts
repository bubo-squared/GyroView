import { seconds, type Seconds } from '../../shared/units/time';

/**
 * How a download reads a file while it plays (ADR 0029).
 */
export interface DownloadPolicy {
  /**
   * How far ahead of the picture it reads once playing has started.
   */
  readonly aheadSeconds: Seconds;
  /**
   * The bytes it may hold or ask for ahead of the picture.
   */
  readonly aheadBytes: number;
  /**
   * The bytes it keeps behind the picture, for short seeks back.
   */
  readonly keepBehindBytes: number;
  /**
   * The longest range it asks for at once, and how many ranges at a time.
   */
  readonly requestSize: number;
  readonly requestsInFlight: number;
  /**
   * Bytes nothing needs between two needed ranges are fetched with them when there are fewer:
   * one request costs less than two apart.
   */
  readonly bridgedGap: number;
  /**
   * Reading ahead tops up once this many of its bytes are missing, so it asks for few large
   * ranges rather than a small one for every frame shown.
   */
  readonly refillBytes: number;
}

const MEBIBYTE = 1_048_576;
/**
 * What the policy reads ahead and keeps behind, as time and at most as bytes: the byte limits
 * bind first on the X5's 210 Mbit/s, the times on slower recordings. A split recording shares
 * the byte limits among its files.
 */
const AHEAD_SECONDS = 10;
const MOST_AHEAD_MEBIBYTES = 128;
const KEEP_BEHIND_SECONDS = 2;
const MOST_KEPT_BEHIND_MEBIBYTES = 32;
const REQUEST_MEBIBYTES = 8;
const REQUESTS_IN_FLIGHT = 2;
const BRIDGED_GAP_MEBIBYTES = 1;
const REFILL_FRACTION = 0.25;

/**
 * The policy for one file of a recording of `fileCount` files, by its bit rate.
 */
export function downloadPolicyFor(
  file: { readonly size: number; readonly duration: Seconds },
  fileCount: number,
): DownloadPolicy {
  const bytesPerSecond = file.size / file.duration;
  const aheadBytes = Math.min(
    Math.round(AHEAD_SECONDS * bytesPerSecond),
    (MOST_AHEAD_MEBIBYTES * MEBIBYTE) / fileCount,
  );
  return {
    aheadSeconds: seconds(AHEAD_SECONDS),
    aheadBytes,
    keepBehindBytes: Math.min(
      Math.round(KEEP_BEHIND_SECONDS * bytesPerSecond),
      (MOST_KEPT_BEHIND_MEBIBYTES * MEBIBYTE) / fileCount,
    ),
    requestSize: REQUEST_MEBIBYTES * MEBIBYTE,
    requestsInFlight: REQUESTS_IN_FLIGHT,
    bridgedGap: BRIDGED_GAP_MEBIBYTES * MEBIBYTE,
    refillBytes: Math.round(aheadBytes * REFILL_FRACTION),
  };
}
