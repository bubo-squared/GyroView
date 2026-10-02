import { describe, expect, it } from 'vitest';

import { hevcCodecStringOf } from './hevcCodecString';

/**
 * A general profile, tier and level as ITU-T H.265 §7.3.3 lays it out: the Main profile (1),
 * compatible with Main and Main 10, main tier, progressive source, level 6.1.
 */
const MAIN_LEVEL_6_1 = Uint8Array.of(0x01, 0x60, 0, 0, 0, 0x80, 0, 0, 0, 0, 0, 183);
const MAIN_LEVEL_5 = Uint8Array.of(0x01, 0x60, 0, 0, 0, 0x80, 0, 0, 0, 0, 0, 150);
const BLANK = new Uint8Array(12);

const VPS = 32;
const SPS = 33;
const PPS = 34;

/**
 * The start of an SPS holding MAIN_LEVEL_6_1 as an encoder writes it: the NAL unit header, a byte
 * of ids and sub-layers, then the profile, tier and level with an emulation prevention byte
 * after every two zero bytes that a zero follows.
 */
const ESCAPED_MAIN_LEVEL_6_1 = [0x01, 0x60, 0, 0, 0x03, 0, 0x80, 0, 0, 0x03, 0, 0, 0x03, 0, 183];
const SPS_OF_MAIN_LEVEL_6_1 = Uint8Array.of(0x42, 0x01, 0x01, ...ESCAPED_MAIN_LEVEL_6_1);
const PARAMETER_SET = Uint8Array.of(0x40, 0x01, 0x0c);

/**
 * An HEVC configuration's payload (ISO/IEC 14496-15 §8.3.3.1): version 1, the given profile,
 * tier and level, fixed fields saying NAL units have four-byte lengths, then one array per
 * parameter set.
 */
function configurationOf(
  profileTierLevel: Uint8Array,
  parameterSets: readonly (readonly [type: number, unit: Uint8Array])[] = [],
): Uint8Array {
  const fixed = [1, ...profileTierLevel, 0xf0, 0, 0xfc, 0xfd, 0xf8, 0xf8, 0, 0, 0x0f];
  const arrays = parameterSets.flatMap(([type, unit]) => [type, 0, 1, 0, unit.length, ...unit]);
  return Uint8Array.from([...fixed, parameterSets.length, ...arrays]);
}

describe('hevcCodecStringOf', () => {
  it('names the profile, tier and level its header declares, as ISO/IEC 14496-15 E.3 spells them', () => {
    expect(hevcCodecStringOf('hvc1', configurationOf(MAIN_LEVEL_6_1))).toBe('hvc1.1.6.L183.80');
  });

  it('spells a high tier as H and the compatibility flags bit-reversed', () => {
    const level = Uint8Array.of(0x22, 0x20, 0, 0, 0x01, 0x90, 0, 0, 0, 0, 0, 150);
    expect(hevcCodecStringOf('hev1', configurationOf(level))).toBe('hev1.2.80000004.H150.90');
  });

  it.each([
    [0b01, 'A'],
    [0b10, 'B'],
    [0b11, 'C'],
  ])('spells profile space %i as the letter %s', (space, letter) => {
    const level = Uint8Array.of((space << 6) | 0x01, 0x60, 0, 0, 0, 0x80, 0, 0, 0, 0, 0, 183);
    expect(hevcCodecStringOf('hvc1', configurationOf(level))).toBe(`hvc1.${letter}1.6.L183.80`);
  });

  it('keeps the zero constraint bytes before a set one and leaves out those after the last', () => {
    const level = Uint8Array.of(0x01, 0x60, 0, 0, 0, 0x90, 0, 0x08, 0, 0, 0, 120);
    expect(hevcCodecStringOf('hvc1', configurationOf(level))).toBe('hvc1.1.6.L120.90.0.8');
  });

  it('reads the SPS where the header names no profile, as the Antigravity A1 leaves it', () => {
    const configuration = configurationOf(BLANK, [
      [VPS, PARAMETER_SET],
      [SPS, SPS_OF_MAIN_LEVEL_6_1],
      [PPS, PARAMETER_SET],
    ]);
    expect(hevcCodecStringOf('hvc1', configuration)).toBe('hvc1.1.6.L183.80');
  });

  it('keeps in the SPS a three after one zero byte and any other byte after two', () => {
    const flagsNeedingNoEscape = [0x60, 0, 0x03, 0, 0x90, 0, 0, 0x80, 0, 0];
    const sps = Uint8Array.of(0x42, 0x01, 0x01, 0x01, ...flagsNeedingNoEscape, 183);
    const configuration = configurationOf(BLANK, [[SPS, sps]]);
    expect(hevcCodecStringOf('hvc1', configuration)).toBe('hvc1.1.C00006.L183.90.0.0.80');
  });

  it('keeps the header where both name a profile', () => {
    const configuration = configurationOf(MAIN_LEVEL_5, [[SPS, SPS_OF_MAIN_LEVEL_6_1]]);
    expect(hevcCodecStringOf('hvc1', configuration)).toBe('hvc1.1.6.L150.80');
  });

  it('keeps a blank header where the configuration carries no SPS to read instead', () => {
    const configuration = configurationOf(BLANK, [[VPS, PARAMETER_SET]]);
    expect(hevcCodecStringOf('hev1', configuration)).toBe('hev1.0.0.L0');
  });

  it.each([
    [
      'an array announces more than the configuration holds',
      configurationOf(BLANK, [[SPS, SPS_OF_MAIN_LEVEL_6_1]]).slice(0, -4),
    ],
    [
      'its SPS ends before the profile, tier and level',
      configurationOf(BLANK, [[SPS, SPS_OF_MAIN_LEVEL_6_1.slice(0, 8)]]),
    ],
  ])('keeps a blank header where %s', (_case, configuration) => {
    expect(hevcCodecStringOf('hvc1', configuration)).toBe('hvc1.0.0.L0');
  });
});
