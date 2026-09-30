import { describe, expect, it } from 'vitest';

import { downloadPolicyFor } from './DownloadPolicy';
import { seconds } from '../../shared/units/time';

const MEBIBYTE = 2 ** 20;
const X5_OFFICE = { size: 6_894_571_870, duration: seconds(262.095) };
const X3_LENS_FILE = { size: 464_299_277, duration: seconds(60.33) };

describe('downloadPolicyFor', () => {
  it('reads ahead at most 128 MiB of a recording faster than that in 10 s', () => {
    const policy = downloadPolicyFor(X5_OFFICE, 1);
    expect(policy.aheadBytes).toBe(128 * MEBIBYTE);
    expect(policy.aheadSeconds).toBe(10);
  });

  it('reads ahead 10 s of a slower recording', () => {
    const policy = downloadPolicyFor(X3_LENS_FILE, 1);
    expect(policy.aheadBytes).toBe(Math.round((10 * X3_LENS_FILE.size) / X3_LENS_FILE.duration));
  });

  it('shares the byte budget among the files of a split recording', () => {
    expect(downloadPolicyFor(X5_OFFICE, 2).aheadBytes).toBe(64 * MEBIBYTE);
    expect(downloadPolicyFor(X5_OFFICE, 2).keepBehindBytes).toBe(16 * MEBIBYTE);
  });

  it('keeps 2 s behind the picture, at most 32 MiB', () => {
    expect(downloadPolicyFor(X5_OFFICE, 1).keepBehindBytes).toBe(32 * MEBIBYTE);
    const slower = downloadPolicyFor(X3_LENS_FILE, 1);
    expect(slower.keepBehindBytes).toBe(
      Math.round((2 * X3_LENS_FILE.size) / X3_LENS_FILE.duration),
    );
  });

  it('asks for at most 8 MiB at once, two ranges at a time, and tops up once a quarter is missing', () => {
    const policy = downloadPolicyFor(X5_OFFICE, 1);
    expect(policy.requestSize).toBe(8 * MEBIBYTE);
    expect(policy.requestsInFlight).toBe(2);
    expect(policy.bridgedGap).toBe(MEBIBYTE);
    expect(policy.refillBytes).toBe(32 * MEBIBYTE);
  });

  it('takes a reader up to 2 s behind the picture for one that follows it', () => {
    expect(downloadPolicyFor(X5_OFFICE, 1).keepBehindSeconds).toBe(2);
  });

  it('resumes after starving once 4 s are downloaded', () => {
    expect(downloadPolicyFor(X5_OFFICE, 1).resumeSeconds).toBe(4);
  });
});
