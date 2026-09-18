const REPLACEMENT_CHARACTER = 0xff_fd;
const ONE_BYTE_LIMIT = 0x80;
const CONTINUATION_PREFIX = 0b1000_0000;
const CONTINUATION_MASK = 0b0011_1111;
const TWO_BYTE_PREFIX = 0b1100_0000;
const THREE_BYTE_PREFIX = 0b1110_0000;
const FOUR_BYTE_PREFIX = 0b1111_0000;
const FIVE_BYTE_PREFIX = 0b1111_1000;
const TWO_BYTE_PAYLOAD_MASK = 0b0001_1111;
const THREE_BYTE_PAYLOAD_MASK = 0b0000_1111;
const FOUR_BYTE_PAYLOAD_MASK = 0b0000_0111;
const CONTINUATION_BITS = 6;
const MAX_CODE_POINT = 0x10_ff_ff;

interface LeadByte {
  readonly payload: number;
  readonly continuationBytes: number;
}

interface DecodedSequence {
  readonly codePoint: number;
  readonly nextPosition: number;
}

function classifyLeadByte(byte: number): LeadByte | undefined {
  if (byte < ONE_BYTE_LIMIT) return { payload: byte, continuationBytes: 0 };
  if (byte >= TWO_BYTE_PREFIX && byte < THREE_BYTE_PREFIX) {
    return { payload: byte & TWO_BYTE_PAYLOAD_MASK, continuationBytes: 1 };
  }
  if (byte >= THREE_BYTE_PREFIX && byte < FOUR_BYTE_PREFIX) {
    return { payload: byte & THREE_BYTE_PAYLOAD_MASK, continuationBytes: 2 };
  }
  return byte >= FOUR_BYTE_PREFIX && byte < FIVE_BYTE_PREFIX
    ? { payload: byte & FOUR_BYTE_PAYLOAD_MASK, continuationBytes: 3 }
    : undefined;
}

function isContinuation(byte: number | undefined): byte is number {
  return byte !== undefined && (byte & ~CONTINUATION_MASK) === CONTINUATION_PREFIX;
}

function decodeSequence(bytes: Uint8Array, start: number): DecodedSequence {
  const lead = classifyLeadByte(bytes[start] ?? 0);
  if (!lead) return { codePoint: REPLACEMENT_CHARACTER, nextPosition: start + 1 };
  let codePoint = lead.payload;
  let position = start + 1;
  let remaining = lead.continuationBytes;
  while (remaining > 0 && isContinuation(bytes[position])) {
    codePoint = (codePoint << CONTINUATION_BITS) | ((bytes[position] ?? 0) & CONTINUATION_MASK);
    position += 1;
    remaining -= 1;
  }
  const isWellFormed = remaining === 0 && codePoint <= MAX_CODE_POINT;
  return { codePoint: isWellFormed ? codePoint : REPLACEMENT_CHARACTER, nextPosition: position };
}

/**
 * Decodes UTF-8 without relying on the TextDecoder global, which the dependency-free core
 * cannot assume. Malformed sequences become U+FFFD, matching TextDecoder's default behaviour.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const codePoints: number[] = [];
  let position = 0;
  while (position < bytes.byteLength) {
    const sequence = decodeSequence(bytes, position);
    codePoints.push(sequence.codePoint);
    position = sequence.nextPosition;
  }
  return String.fromCodePoint(...codePoints);
}
