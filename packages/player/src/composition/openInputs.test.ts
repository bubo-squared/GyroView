import { seconds, type SampleTable, type Seconds, type TrackColour } from '@gyroview/core';
import { AS_RECORDED, X6_I_LOG_TO_SDR_BT709 } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { displayConversionsFor, downloadPolicyOf } from './openInputs';

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

/**
 * Two lens tracks as the X6's bitstream names an I-Log recording's colour: as standard mode's.
 */
const TAGGED_BT709: TrackColour = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  range: 'limited',
};
const LENS_TRACKS = [
  { description: { colour: TAGGED_BT709 } },
  { description: { colour: TAGGED_BT709 } },
];

describe('displayConversionsFor', () => {
  it('shows an X6 recording whose info record names I-Log by its curve, whatever its tracks say', () => {
    const choice = displayConversionsFor(
      { model: 'Insta360 X6', captureMode: 'I_Log' },
      LENS_TRACKS,
    );
    expect(choice).toEqual({
      conversions: [X6_I_LOG_TO_SDR_BT709, X6_I_LOG_TO_SDR_BT709],
      warnings: [],
    });
  });

  it("draws another camera's I-Log as recorded, and says so", () => {
    const choice = displayConversionsFor(
      { model: 'Insta360 X5', captureMode: 'I_Log' },
      LENS_TRACKS,
    );
    expect(choice.conversions).toEqual([
      { ...AS_RECORDED, matrix: 'bt709' },
      { ...AS_RECORDED, matrix: 'bt709' },
    ]);
    expect(choice.warnings).toHaveLength(1);
  });

  it('shows a recording made in standard mode as its tracks say', () => {
    const choice = displayConversionsFor(
      { model: 'Insta360 X6', captureMode: 'standard' },
      LENS_TRACKS,
    );
    expect(choice.conversions.map((conversion) => conversion.kind)).toEqual([
      'as-recorded',
      'as-recorded',
    ]);
  });
});
