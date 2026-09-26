/**
 * Token positions inside one lens block of each calibration string version, relative to the
 * block start. Sources: telemetry-parser (v3 order), insta360-rs docs (v2 order), and the X5
 * recordings where the same `cx cy yaw pitch roll` values appear in all three strings, which
 * pins the v1 order to `r cx cy yaw pitch roll`.
 */
export const V1Token = {
  EdgeRadius: 0,
  CenterX: 1,
  CenterY: 2,
  Yaw: 3,
  Pitch: 4,
  Roll: 5,
} as const;

export const V2Token = {
  EdgeRadius: 0,
  CenterX: 1,
  CenterY: 2,
  Yaw: 3,
  Pitch: 4,
  Roll: 5,
  TranslationX: 6,
  TranslationY: 7,
  TranslationZ: 8,
  C1: 9,
  C2: 10,
  C3: 11,
  C4: 12,
  CanvasWidth: 13,
  CanvasHeight: 14,
  LensType: 15,
} as const;

export const V3Token = {
  Xi: 0,
  FocalX: 1,
  FocalY: 2,
  CenterX: 3,
  CenterY: 4,
  Yaw: 5,
  Pitch: 6,
  Roll: 7,
  TranslationX: 8,
  TranslationY: 9,
  TranslationZ: 10,
  K1: 11,
  K2: 12,
  K3: 13,
  P1: 14,
  P2: 15,
  CanvasWidth: 16,
  CanvasHeight: 17,
  LensType: 18,
} as const;

/**
 * Tokens after the lens blocks. v1 ends with canvas width, canvas height and a version word;
 * v2 and v3 end with the version word only.
 */
export const V1Trailing = { CanvasWidth: 0, CanvasHeight: 1, VersionWord: 2 } as const;

export const LENS_COUNT_TOKEN = 0;
export const FIRST_LENS_TOKEN = 1;
export const V1_LENS_TOKENS = 6;
export const V1_TRAILING_TOKENS = 3;
export const V2_LENS_TOKENS = 16;
export const V3_LENS_TOKENS = 19;
export const V6_LENS_TOKENS = 27;
export const VERSIONED_TRAILING_TOKENS = 1;

/**
 * The version word: v2/v3 keep the version in the high 16 bits. v1 keeps the lens type in the
 * low 10 bits (1137 on the X5 = lens type 113, 3105 on the ONE R = lens type 33); its upper bits
 * vary between cameras and carry no version.
 */
export const VERSION_WORD_SHIFT = 16;
