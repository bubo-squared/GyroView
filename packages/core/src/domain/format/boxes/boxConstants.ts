/**
 * ISO base media file format (ISO/IEC 14496-12) top-level box header: u32 BE size, 4-char type,
 * and for size 1 a u64 BE large size. Size 0 means "to end of file".
 */
export const BOX_HEADER_SIZE = 8;
export const LARGE_BOX_HEADER_SIZE = 16;
export const BOX_SIZE_OFFSET = 0;
export const BOX_TYPE_OFFSET = 4;
export const BOX_TYPE_LENGTH = 4;
export const LARGE_SIZE_OFFSET = 8;
export const BOX_SIZE_IS_LARGE = 1;
export const BOX_SIZE_TO_END_OF_FILE = 0;

/**
 * A full box (ISO/IEC 14496-12 §4.2.2) opens its payload with a u8 version and 24 bits of flags,
 * read together as one big-endian u32.
 */
export const FULL_BOX_HEADER_SIZE = 4;
export const FULL_BOX_VERSION_OFFSET = 0;
export const FULL_BOX_FLAG_BITS = 24;

/**
 * The box types the player looks for. `inst` is Insta360's wrapper around the trailer on newer
 * firmware; older firmware appends the trailer bare, outside any box.
 */
export const BoxType = {
  Insta360Trailer: 'inst',
} as const;

/**
 * Four printable ASCII characters, which is what every real box type looks like. Anything else
 * at a box boundary means the boxes have ended and raw trailer bytes follow.
 */
const PLAUSIBLE_BOX_TYPE = /^[ -~]{4}$/u;

export function isPlausibleBoxType(type: string): boolean {
  return PLAUSIBLE_BOX_TYPE.test(type);
}
