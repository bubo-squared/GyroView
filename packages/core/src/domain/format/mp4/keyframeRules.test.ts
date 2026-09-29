import { describe, expect, it } from 'vitest';

import { keyframeRuleFor } from './keyframeRules';
import type { KeyframeRule } from '../../container/KeyframeRule';

/**
 * A sample of NAL units, each after its length in `lengthSize` bytes; a unit is its header byte
 * (and a second one for HEVC) followed by a payload byte.
 */
function sampleOf(lengthSize: number, units: readonly (readonly number[])[]): Uint8Array {
  const bytes: number[] = [];
  for (const unit of units) {
    const length = unit.length + 1;
    for (let shift = lengthSize - 1; shift >= 0; shift -= 1)
      bytes.push((length >> (8 * shift)) & 0xff);
    bytes.push(...unit, 0xaa);
  }
  return Uint8Array.from(bytes);
}

const avcUnit = (type: number): number[] => [0x60 | type];
const hevcUnit = (type: number): number[] => [type << 1, 1];

function isKeyframeOf(rule: KeyframeRule, lengthSize: number, units: number[][]): boolean {
  return rule.isKeyframe(sampleOf(lengthSize, units));
}

describe('the H.264 keyframe rule', () => {
  const rule = keyframeRuleFor({ sampleEntryType: 'avc1', nalLengthSize: 4 });

  it('takes a sample with an IDR slice for a keyframe, whatever parameter sets precede it', () => {
    expect(isKeyframeOf(rule, 4, [avcUnit(9), avcUnit(7), avcUnit(8), avcUnit(5)])).toBe(true);
  });

  it('does not take a sample of non-IDR slices for one', () => {
    expect(isKeyframeOf(rule, 4, [avcUnit(6), avcUnit(1)])).toBe(false);
    expect(isKeyframeOf(rule, 4, [avcUnit(2)])).toBe(false);
  });

  it('does not take a recovery point for a keyframe, where decoding would start at no IDR', () => {
    expect(isKeyframeOf(rule, 4, [avcUnit(6)])).toBe(false);
  });

  it('reads the NAL lengths in as many bytes as the configuration says', () => {
    const shortLengths = keyframeRuleFor({ sampleEntryType: 'avc3', nalLengthSize: 2 });
    expect(isKeyframeOf(shortLengths, 2, [avcUnit(7), avcUnit(5)])).toBe(true);
  });

  it('does not take an empty or cut-off sample for a keyframe', () => {
    expect(rule.isKeyframe(new Uint8Array())).toBe(false);
    const cutOff = sampleOf(4, [avcUnit(5)]).subarray(0, 5);
    expect(rule.isKeyframe(cutOff)).toBe(false);
  });
});

describe('the H.265 keyframe rule', () => {
  const rule = keyframeRuleFor({ sampleEntryType: 'hvc1', nalLengthSize: 4 });

  it('takes a sample whose first picture is an intra random access point for a keyframe', () => {
    expect(isKeyframeOf(rule, 4, [hevcUnit(32), hevcUnit(33), hevcUnit(34), hevcUnit(19)])).toBe(
      true,
    );
    expect(isKeyframeOf(rule, 4, [hevcUnit(21)])).toBe(true);
    expect(isKeyframeOf(rule, 4, [hevcUnit(16)])).toBe(true);
    expect(isKeyframeOf(rule, 4, [hevcUnit(23)])).toBe(true);
  });

  it('does not take a sample of trailing pictures for one', () => {
    expect(isKeyframeOf(rule, 4, [hevcUnit(39), hevcUnit(1)])).toBe(false);
    expect(isKeyframeOf(rule, 4, [hevcUnit(0)])).toBe(false);
  });

  it('takes the other HEVC sample entry by the same rule', () => {
    const other = keyframeRuleFor({ sampleEntryType: 'hev1', nalLengthSize: 4 });
    expect(isKeyframeOf(other, 4, [hevcUnit(1)])).toBe(false);
  });
});

describe('keyframeRuleFor', () => {
  it('trusts the sync samples of a track without NAL units, as sound', () => {
    const rule = keyframeRuleFor({ sampleEntryType: 'mp4a', nalLengthSize: undefined });
    expect(rule.isKeyframe(new Uint8Array())).toBe(true);
  });

  it('trusts the sync samples of a video track whose configuration gives no NAL length size', () => {
    const rule = keyframeRuleFor({ sampleEntryType: 'avc1', nalLengthSize: undefined });
    expect(rule.isKeyframe(Uint8Array.of(1, 2))).toBe(true);
  });
});
