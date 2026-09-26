import { ensureInvariant } from '../shared/errors/GyroViewError';

const ASCII_LIMIT = 0x80;

/**
 * Encodes ASCII text (box types, the trailer magic) for fixtures, without the TextEncoder
 * global, which the dependency-free core cannot assume. Anything beyond ASCII is a programming
 * error here.
 */
export function encodeAscii(text: string): Uint8Array {
  const bytes = Uint8Array.from(text, (character) => character.codePointAt(0) ?? ASCII_LIMIT);
  ensureInvariant(
    bytes.every((byte) => byte < ASCII_LIMIT),
    `"${text}" is not ASCII`,
  );
  return bytes;
}
