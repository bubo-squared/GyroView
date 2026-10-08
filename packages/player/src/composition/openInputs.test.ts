import { seconds, type SampleTable, type Seconds } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { downloadPolicyOf } from './openInputs';

const MEBIBYTE = 2 ** 20;

/**
 * An X5 file as opening read it, its server having answered its ranges after `answerWait`.
 */
function x5File(answerWait?: Seconds): Parameters<typeof downloadPolicyOf>[0] {
  return {
    size: 6_894_571_870,
    table: { duration: seconds(262.095) } as SampleTable,
    answerWait: answerWait && ((): Seconds => answerWait),
  };
}

describe('downloadPolicyOf', () => {
  it("asks a server slow to answer a refill at a time, three ranges at once, by its opening reads' wait", () => {
    const policy = downloadPolicyOf(x5File(seconds(0.85)), 1);
    expect(policy.requestSize).toBe(32 * MEBIBYTE);
    expect(policy.requestsInFlight).toBe(3);
  });

  it('asks a server that answered quickly, or a local file, 8 MiB at a time, two at once', () => {
    for (const file of [x5File(seconds(0.05)), x5File()]) {
      const policy = downloadPolicyOf(file, 1);
      expect(policy.requestSize).toBe(8 * MEBIBYTE);
      expect(policy.requestsInFlight).toBe(2);
    }
  });
});
