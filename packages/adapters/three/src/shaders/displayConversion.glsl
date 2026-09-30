// How lens i's texels are brought to the SDR BT.709 display, as the core's toDisplay (ADR 0033):
// the browser's upload has applied the track's matrix and range; the transfer and primaries
// are this chunk's. Shown as recorded, or HLG converted to scene light, into BT.709 and toned.
uniform int uLensConversion[MAX_LENSES];
uniform mat3 uLensGamut[MAX_LENSES];
// Exposure gain, roll-off start, roll-off ceiling, display encoding power.
uniform vec4 uLensTone[MAX_LENSES];

float hlgInverseOetf(float signal) {
  return signal <= HLG_SEGMENT_JOIN
    ? signal * signal / float(HLG_SQUARE_SEGMENT_DIVISOR)
    : (exp((signal - HLG_C) / HLG_A) + HLG_B) / float(HLG_LOG_SEGMENT_DIVISOR);
}

float encodedForDisplay(float light, vec4 tone) {
  float exposed = max(light, 0.0) * tone.x;
  float over = exposed - tone.y;
  float rolledOff = over <= 0.0 ? exposed : tone.y + over / (1.0 + over / (tone.z - tone.y));
  return min(pow(rolledOff, 1.0 / tone.w), 1.0);
}

vec3 hlgToSdrBt709(int i, vec3 texel) {
  vec3 scene = vec3(hlgInverseOetf(texel.r), hlgInverseOetf(texel.g), hlgInverseOetf(texel.b));
  vec3 light = uLensGamut[i] * scene;
  vec4 tone = uLensTone[i];
  return vec3(
    encodedForDisplay(light.r, tone),
    encodedForDisplay(light.g, tone),
    encodedForDisplay(light.b, tone)
  );
}

// Lens i's texel as the display shows it; as recorded for a kind this shader does not know.
vec3 toDisplay(int i, vec3 texel) {
  if (uLensConversion[i] == CONVERSION_AS_RECORDED) return texel;
  if (uLensConversion[i] == CONVERSION_HLG_TO_SDR_BT709) return hlgToSdrBt709(i, texel);
  return texel;
}
