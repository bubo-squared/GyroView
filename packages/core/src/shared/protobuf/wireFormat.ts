/**
 * The Protocol Buffers wire format (protobuf encoding spec, "Message Structure"): the wire types
 * a field key names and how keys and varints are laid out. The decoder and the fixtures' encoder
 * share it, so that the two cannot disagree on a byte.
 *
 * The wire types the info record uses; groups (3, 4) are obsolete, and the decoder rejects them.
 */
export const WireType = {
  Varint: 0,
  Fixed64: 1,
  LengthDelimited: 2,
  Fixed32: 5,
} as const;

/**
 * A field key is `(field number << 3) | wire type`.
 */
export const FIELD_NUMBER_SHIFT = 3;
export const WIRE_TYPE_MASK = 0b111;

/**
 * A varint carries seven bits a byte, least significant group first, the high bit set on every
 * byte but the last; a 64-bit value takes at most ten.
 */
export const VARINT_PAYLOAD_BITS = 7;
export const VARINT_PAYLOAD_MASK = 0x7f;
export const VARINT_CONTINUATION_BIT = 0x80;
export const MAX_VARINT_BYTES = 10;

export const FIXED64_SIZE = 8;
export const FIXED32_SIZE = 4;
