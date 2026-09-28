import { lazy } from '../lazy';

/**
 * What the core uses of the WHATWG `TextDecoder`, a global of every runtime it runs in
 * (browsers, Node, Deno), which its types, naming neither the DOM nor Node, do not declare.
 */
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}

interface TextDecoderGlobal {
  readonly TextDecoder: new (label: 'utf8') => Utf8Decoder;
}

const decoder = lazy(() => new (globalThis as unknown as TextDecoderGlobal).TextDecoder('utf8'));

/**
 * Text the camera wrote as UTF-8; malformed sequences, an encoded surrogate among them, become
 * U+FFFD, as the platform decodes them.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  return decoder().decode(bytes);
}
