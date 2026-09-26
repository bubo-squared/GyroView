/**
 * Legacy calibration string of the ONE R fixture (test/fixtures/thirdparty/insta360py/sample.insv):
 * version word 3105 = lens type 33 with different upper bits than the X5's 1137.
 */
export const ONE_R_LEGACY_CALIBRATION =
  '2_1480.69_1517.57_1520.13_-0.186949_0.0336344_-179.227_1479.61_4553.12_1526.43_0.82149_0.0305849_0.894074_6080_3040_3105';

const V6_LENS_TOKENS = 27;
const V6_VERSION_WORD = 6 << 16;

/**
 * A structurally valid v6 string (27 tokens per lens) with placeholder values.
 */
export function v6CalibrationString(): string {
  return [
    '2',
    ...Array.from({ length: 2 * V6_LENS_TOKENS }, () => '1'),
    String(V6_VERSION_WORD),
  ].join('_');
}
