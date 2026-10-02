import {
  HEVC_ARRAY_COUNT_OFFSET,
  HEVC_ARRAY_NAL_UNIT_COUNT_OFFSET,
  HEVC_ARRAY_NAL_UNIT_TYPE_MASK,
  HEVC_ARRAY_NAL_UNITS_OFFSET,
  HEVC_ARRAYS_OFFSET,
  HEVC_NAL_UNIT_LENGTH_SIZE,
  HEVC_PROFILE_TIER_LEVEL_OFFSET,
} from './mp4Layouts';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { hasErrorCode } from '../../../shared/errors/GyroViewError';

/**
 * The general part of profile_tier_level (ITU-T H.265 §7.3.3), as an SPS carries it and an HEVC
 * configuration's header repeats it: two bits of profile space, the tier flag and five bits of
 * profile; 32 compatibility flags; 48 bits of constraint flags; the level.
 */
const PROFILE_SPACE_SHIFT = 6;
const HIGH_TIER_FLAG = 0b10_0000;
const PROFILE_MASK = 0b1_1111;
const COMPATIBILITY_FLAGS_OFFSET = 1;
const CONSTRAINT_FLAGS_OFFSET = 5;
const CONSTRAINT_FLAGS_LENGTH = 6;
const LEVEL_OFFSET = 11;
const COMPATIBILITY_FLAG_COUNT = 32;
/**
 * No profile has the number zero (ITU-T H.265 Annex A): a header naming it was left blank.
 */
const NO_PROFILE = 0;

/**
 * An SPS (NAL unit type 33, ITU-T H.265 Table 7-1) opens with its two-byte NAL unit header and
 * a byte of parameter-set id, sub-layer count and nesting flag; its profile_tier_level follows
 * (§7.3.2.2.1).
 */
const SPS_NAL_UNIT_TYPE = 33;
const SPS_PROFILE_TIER_LEVEL_OFFSET = 3;

/**
 * Inside a NAL unit, the encoder writes an emulation_prevention_three_byte after two zero bytes
 * that a byte of 0 to 3 would follow, and the decoder drops it (ITU-T H.265 §7.4.2). The SPS's
 * flags are mostly zeros, so they hold such bytes, and are read with them dropped.
 */
const EMULATION_PREVENTION_BYTE = 0x03;
const ZEROS_BEFORE_EMULATION_PREVENTION = 2;

/**
 * ISO/IEC 14496-15 Annex E.3: the profile space as no letter or A to C, the tier as L or H, the
 * flags in hexadecimal.
 */
const PROFILE_SPACE_CODES: readonly string[] = ['', 'A', 'B', 'C'];
const MAIN_TIER_CODE = 'L';
const HIGH_TIER_CODE = 'H';
const HEXADECIMAL = 16;

interface ProfileTierLevel {
  readonly profileSpace: number;
  readonly isHighTier: boolean;
  readonly profile: number;
  readonly compatibilityFlags: number;
  readonly constraintFlags: readonly number[];
  readonly level: number;
}

interface ParameterSetArray {
  readonly nalUnitType: number;
  readonly nalUnits: readonly Uint8Array[];
  readonly end: number;
}

/**
 * The WebCodecs codec string of an HEVC track (ISO/IEC 14496-15 Annex E.3), from its sample
 * entry type and its configuration (the `hvcC` box's payload). The configuration's header is
 * meant to repeat the profile, tier and level of the stream's SPS; where it names no profile, as
 * the Antigravity A1 leaves it, the SPS the configuration carries is read instead, since browsers
 * refuse a codec string without a profile although they decode the stream.
 */
export function hevcCodecStringOf(sampleEntryType: string, configuration: Uint8Array): string {
  return codecStringOf(sampleEntryType, declaredProfileTierLevelOf(configuration));
}

function declaredProfileTierLevelOf(configuration: Uint8Array): ProfileTierLevel {
  const header = profileTierLevelAt(new ByteReader(configuration), HEVC_PROFILE_TIER_LEVEL_OFFSET);
  return header.profile === NO_PROFILE ? (spsProfileTierLevelIn(configuration) ?? header) : header;
}

/**
 * The profile, tier and level of the first SPS the configuration carries; undefined where it
 * carries none, or where its parameter sets run past its end. The header's blank string then
 * stands, which browsers refuse as a codec they do not support.
 */
function spsProfileTierLevelIn(configuration: Uint8Array): ProfileTierLevel | undefined {
  try {
    const sps = spsIn(configuration);
    return sps === undefined ? undefined : spsProfileTierLevelOf(sps);
  } catch (error) {
    if (hasErrorCode(error, 'binary-out-of-bounds')) return undefined;
    throw error;
  }
}

function profileTierLevelAt(reader: ByteReader, offset: number): ProfileTierLevel {
  const first = reader.uint8At(offset);
  return {
    profileSpace: first >> PROFILE_SPACE_SHIFT,
    isHighTier: (first & HIGH_TIER_FLAG) !== 0,
    profile: first & PROFILE_MASK,
    compatibilityFlags: reader.uint32BeAt(offset + COMPATIBILITY_FLAGS_OFFSET),
    constraintFlags: [...reader.bytesAt(offset + CONSTRAINT_FLAGS_OFFSET, CONSTRAINT_FLAGS_LENGTH)],
    level: reader.uint8At(offset + LEVEL_OFFSET),
  };
}

function spsProfileTierLevelOf(sps: Uint8Array): ProfileTierLevel {
  const reader = new ByteReader(withoutEmulationPrevention(sps));
  return profileTierLevelAt(reader, SPS_PROFILE_TIER_LEVEL_OFFSET);
}

/**
 * The first SPS among the configuration's parameter sets; undefined where it carries none, as an
 * `hev1` track may, keeping its parameter sets in the stream.
 */
function spsIn(configuration: Uint8Array): Uint8Array | undefined {
  const reader = new ByteReader(configuration);
  let offset = HEVC_ARRAYS_OFFSET;
  for (let index = 0; index < reader.uint8At(HEVC_ARRAY_COUNT_OFFSET); index += 1) {
    const array = parameterSetArrayAt(reader, offset);
    const [sps] = array.nalUnitType === SPS_NAL_UNIT_TYPE ? array.nalUnits : [];
    if (sps !== undefined) return sps;
    offset = array.end;
  }
  return undefined;
}

function parameterSetArrayAt(reader: ByteReader, offset: number): ParameterSetArray {
  const nalUnitType = reader.uint8At(offset) & HEVC_ARRAY_NAL_UNIT_TYPE_MASK;
  const count = reader.uint16BeAt(offset + HEVC_ARRAY_NAL_UNIT_COUNT_OFFSET);
  const nalUnits: Uint8Array[] = [];
  let unitOffset = offset + HEVC_ARRAY_NAL_UNITS_OFFSET;
  for (let index = 0; index < count; index += 1) {
    const length = reader.uint16BeAt(unitOffset);
    nalUnits.push(reader.bytesAt(unitOffset + HEVC_NAL_UNIT_LENGTH_SIZE, length));
    unitOffset += HEVC_NAL_UNIT_LENGTH_SIZE + length;
  }
  return { nalUnitType, nalUnits, end: unitOffset };
}

/**
 * A NAL unit as the decoder reads it, its emulation prevention bytes dropped.
 */
function withoutEmulationPrevention(nalUnit: Uint8Array): Uint8Array {
  const kept: number[] = [];
  let zeros = 0;
  for (const byte of nalUnit) {
    const isEmulationPrevention =
      zeros >= ZEROS_BEFORE_EMULATION_PREVENTION && byte === EMULATION_PREVENTION_BYTE;
    if (!isEmulationPrevention) kept.push(byte);
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(kept);
}

function codecStringOf(sampleEntryType: string, declared: ProfileTierLevel): string {
  const profile = `${PROFILE_SPACE_CODES[declared.profileSpace] ?? ''}${declared.profile}`;
  const tier = declared.isHighTier ? HIGH_TIER_CODE : MAIN_TIER_CODE;
  const constraints = withoutTrailingZeros(declared.constraintFlags).map((byte) =>
    hexadecimalOf(byte),
  );
  return [
    sampleEntryType,
    profile,
    hexadecimalOf(reversedBitsOf(declared.compatibilityFlags)),
    `${tier}${declared.level}`,
    ...constraints,
  ].join('.');
}

/**
 * The compatibility flags as Annex E.3 writes them: flag 0, the configuration's most significant
 * bit, becomes the least significant.
 */
function reversedBitsOf(flags: number): number {
  let reversed = 0;
  for (let bit = 0; bit < COMPATIBILITY_FLAG_COUNT; bit += 1) {
    reversed = (reversed << 1) | ((flags >>> bit) & 1);
  }
  return reversed >>> 0;
}

function withoutTrailingZeros(bytes: readonly number[]): readonly number[] {
  const lastSet = bytes.findLastIndex((byte) => byte !== 0);
  return bytes.slice(0, lastSet + 1);
}

function hexadecimalOf(value: number): string {
  return value.toString(HEXADECIMAL).toUpperCase();
}
