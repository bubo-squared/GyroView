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
   * How far behind the picture a reader still follows it (sound lags the picture by the
   * decoders' lead); one further behind, as the sound is until it follows a seek, wants nothing.
   */
  readonly keepBehindSeconds: Seconds;
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
  /**
   * Readers moving on through bytes that have come change the plan by little: it is made again
   * once they have taken this many bytes since the last, and at once whenever one opens, closes
   * or waits for bytes no transfer brings (ADR 0036).
   */
  readonly replanBytes: number;
  /**
   * How much of the picture ahead must be downloaded before playback that starved of it plays
   * again, at most what the budget holds less a request (ADR 0011).
   */
  readonly resumeSeconds: Seconds;
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
 * Planning walks every sample in the window, a few thousand on a fast recording; made for each
 * sample read, it took more of the main thread than drawing the frames (ADR 0036). Sixteen plans
 * a refill keep a top-up within a sixteenth of a refill of falling due, and make about a dozen
 * plans a second on the X5's recordings where there were 170.
 */
const REPLANS_PER_REFILL = 16;
/**
 * Long enough that a link slower than the recording plays in stretches rather than frame by
 * frame, short enough that the wait does not feel like a stop.
 */
const RESUME_SECONDS = 4;
/**
 * A server that takes this long to answer a request is slow to answer: Google Drive's API
 * answered each range after 0.75 to 0.95 s (measured 2026-10-08), where a CDN answers in about
 * 0.05 s (ADR 0044).
 */
const SLOW_ANSWER_SECONDS = 0.3;
/**
 * From a server slow to answer, a lone file keeps three ranges coming: with each top-up one
 * range, Drive's should then come at about 42 MiB/s (estimated from its measured waits and
 * rates, to be confirmed in a browser), against 13 MiB/s measured from two of 8 MiB, and an X5
 * plays at 25 MiB/s. The files of a split pair keep two each, so the pair stays at four
 * requests, within what a browser opens to an HTTP/1.1 host.
 */
const SLOW_SERVER_REQUESTS_IN_FLIGHT = 3;

/**
 * What the policy is chosen by: the file's size and length, and how long its server took to
 * answer the byte ranges that opened it, where it was measured.
 */
export interface DownloadedFileFacts {
  readonly size: number;
  readonly duration: Seconds;
  readonly answerWait?: Seconds | undefined;
}

/**
 * The policy for one file of a recording of `fileCount` files, by its bit rate and its server.
 */
export function downloadPolicyFor(file: DownloadedFileFacts, fileCount: number): DownloadPolicy {
  const bytesPerSecond = file.size / file.duration;
  const aheadBytes = Math.min(
    Math.round(AHEAD_SECONDS * bytesPerSecond),
    (MOST_AHEAD_MEBIBYTES * MEBIBYTE) / fileCount,
  );
  const refillBytes = Math.round(aheadBytes * REFILL_FRACTION);
  return {
    aheadSeconds: seconds(AHEAD_SECONDS),
    aheadBytes,
    keepBehindBytes: Math.min(
      Math.round(KEEP_BEHIND_SECONDS * bytesPerSecond),
      (MOST_KEPT_BEHIND_MEBIBYTES * MEBIBYTE) / fileCount,
    ),
    keepBehindSeconds: seconds(KEEP_BEHIND_SECONDS),
    ...rangesAtOnceFor({ answerWait: file.answerWait, refillBytes, fileCount }),
    bridgedGap: BRIDGED_GAP_MEBIBYTES * MEBIBYTE,
    refillBytes,
    replanBytes: Math.round(refillBytes / REPLANS_PER_REFILL),
    resumeSeconds: seconds(RESUME_SECONDS),
  };
}

interface RequestFacts {
  readonly answerWait: Seconds | undefined;
  readonly refillBytes: number;
  readonly fileCount: number;
}

/**
 * How large and how many the ranges asked for at once are (ADR 0044): from a server slow to
 * answer, a top-up is one range, since each range waits as long for its answer, and a lone file
 * keeps a third coming; from any other, as before.
 */
function rangesAtOnceFor(
  facts: RequestFacts,
): Pick<DownloadPolicy, 'requestSize' | 'requestsInFlight'> {
  const baseSize = REQUEST_MEBIBYTES * MEBIBYTE;
  const isSlowToAnswer = (facts.answerWait ?? 0) >= SLOW_ANSWER_SECONDS;
  const isAlone = facts.fileCount === 1;
  return isSlowToAnswer
    ? {
        requestSize: Math.max(baseSize, facts.refillBytes),
        requestsInFlight: isAlone ? SLOW_SERVER_REQUESTS_IN_FLIGHT : REQUESTS_IN_FLIGHT,
      }
    : { requestSize: baseSize, requestsInFlight: REQUESTS_IN_FLIGHT };
}
