import { AVC_SAMPLE_ENTRIES, HEVC_SAMPLE_ENTRIES } from './mp4BoxTypes';
import { EVERY_SAMPLE_IS_A_KEYFRAME, type KeyframeRule } from '../../container/KeyframeRule';

type Verdict = 'keyframe' | 'not-a-keyframe' | 'read-on';

/**
 * How one codec family names its NAL units and what each says of the picture in its sample.
 */
interface NalFamily {
  typeOf(header: number): number;
  verdictOn(type: number): Verdict;
}

/**
 * ITU-T H.264 Table 7-1: nal_unit_type is the low five bits of the header byte; types 1 to 4 are
 * slices of a picture that is not an IDR picture, type 5 a slice of one.
 */
const AVC_TYPE_MASK = 0b1_1111;
const AVC_FIRST_NON_IDR_SLICE = 1;
const AVC_LAST_SLICE_PARTITION = 4;
const AVC_IDR_SLICE = 5;

/**
 * ITU-T H.265 Table 7-1: nal_unit_type is six bits after the header's first bit; types 0 to 15
 * are pictures that are no intra random access point, 16 (BLA_W_LP) to 23 (RSV_IRAP_VCL23) ones
 * that are, and the rest (reserved, parameter sets, SEI) say nothing of the picture.
 */
const HEVC_TYPE_SHIFT = 1;
const HEVC_TYPE_MASK = 0b11_1111;
const HEVC_FIRST_IRAP = 16;
const HEVC_LAST_IRAP = 23;

/**
 * Only an IDR slice starts decoding. mediabunny also takes a recovery-point SEI outside
 * Chromium, where decoding from it may show broken frames first; the player never starts there.
 */
const AVC: NalFamily = {
  typeOf: (header) => header & AVC_TYPE_MASK,
  verdictOn: (type) => {
    if (type === AVC_IDR_SLICE) return 'keyframe';
    const isOtherSlice = type >= AVC_FIRST_NON_IDR_SLICE && type <= AVC_LAST_SLICE_PARTITION;
    return isOtherSlice ? 'not-a-keyframe' : 'read-on';
  },
};

const HEVC: NalFamily = {
  typeOf: (header) => (header >> HEVC_TYPE_SHIFT) & HEVC_TYPE_MASK,
  verdictOn: (type) => {
    if (type < HEVC_FIRST_IRAP) return 'not-a-keyframe';
    return type <= HEVC_LAST_IRAP ? 'keyframe' : 'read-on';
  },
};

const BITS_PER_BYTE = 8;

/**
 * Reads a sample's NAL units one after another, each after its length, until one tells whether
 * the picture is a keyframe; a sample that never tells, or whose units run past its end, is not
 * one.
 */
class NalKeyframeRule implements KeyframeRule {
  public constructor(
    private readonly family: NalFamily,
    private readonly lengthSize: number,
  ) {}

  public isKeyframe(sample: Uint8Array): boolean {
    let offset = 0;
    while (offset + this.lengthSize < sample.length) {
      const unitStart = offset + this.lengthSize;
      const unitEnd = unitStart + lengthAt(sample, offset, this.lengthSize);
      if (unitEnd > sample.length) return false;
      // An empty unit has no header: the byte after its length is the next unit's length.
      const verdict =
        unitEnd === unitStart
          ? 'read-on'
          : this.family.verdictOn(this.family.typeOf(sample[unitStart] ?? 0));
      if (verdict !== 'read-on') return verdict === 'keyframe';
      offset = unitEnd;
    }
    return false;
  }
}

function lengthAt(sample: Uint8Array, offset: number, size: number): number {
  let length = 0;
  for (let index = 0; index < size; index += 1) {
    length = length * 2 ** BITS_PER_BYTE + (sample[offset + index] ?? 0);
  }
  return length;
}

const FAMILIES_BY_SAMPLE_ENTRY: readonly (readonly [readonly string[], NalFamily])[] = [
  [AVC_SAMPLE_ENTRIES, AVC],
  [HEVC_SAMPLE_ENTRIES, HEVC],
];

/**
 * The rule for a track's codec, by its sample entry. A codec without NAL units, or whose length
 * size is unknown, keeps its sample table's word.
 */
export function keyframeRuleFor(entry: {
  readonly sampleEntryType: string;
  readonly nalLengthSize: number | undefined;
}): KeyframeRule {
  const { sampleEntryType, nalLengthSize } = entry;
  const [, family] =
    FAMILIES_BY_SAMPLE_ENTRY.find(([entries]) => entries.includes(sampleEntryType)) ?? [];
  return family && nalLengthSize !== undefined
    ? new NalKeyframeRule(family, nalLengthSize)
    : EVERY_SAMPLE_IS_A_KEYFRAME;
}
