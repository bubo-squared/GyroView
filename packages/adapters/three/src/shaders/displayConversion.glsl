// How lens i's texels are brought to the SDR BT.709 display, as the core's exposureSignalOf and
// shownOf (ADR 0033): the browser's upload has applied the track's matrix and range; the
// transfer and primaries are this chunk's. Shown as recorded, or HLG converted to scene light,
// into BT.709 and toned; gain matching scales the exposure signal between the two (ADR 0012).
uniform int uLensConversion[MAX_LENSES];
// R′G′B′ through the matrix a frame names back to the track's own (matrixCorrectionOf).
uniform mat3 uLensMatrixCorrection[MAX_LENSES];
uniform mat3 uLensGamut[MAX_LENSES];
// Exposure, roll-off start, roll-off ceiling, display encoding power.
uniform vec4 uLensTone[MAX_LENSES];

struct ToneCurve {
  float exposure;
  float kneeStart;
  float ceiling;
  float exponent;
};

ToneCurve toneOf(int i) {
  vec4 tone = uLensTone[i];
  return ToneCurve(tone.x, tone.y, tone.z, tone.w);
}

float hlgInverseOetf(float signal) {
  return signal <= HLG_SEGMENT_JOIN
    ? signal * signal / HLG_SQUARE_SEGMENT_DIVISOR
    : (exp((signal - HLG_C) / HLG_A) + HLG_B) / HLG_LOG_SEGMENT_DIVISOR;
}

const vec3 BT709_LUMINANCE = vec3(BT709_LUMINANCE_RED, BT709_LUMINANCE_GREEN, BT709_LUMINANCE_BLUE);

float rolledOff(float luminance, ToneCurve tone) {
  float over = luminance - tone.kneeStart;
  return over <= 0.0
    ? luminance
    : tone.kneeStart + over / (1.0 + over / (tone.ceiling - tone.kneeStart));
}

// The signal exposed back to light, its luminance rolled off with every channel scaled alike,
// and encoded for the display.
vec3 tonedFrom(vec3 signal, ToneCurve tone) {
  vec3 light = tone.exposure * pow(signal, vec3(tone.exponent));
  float luminance = dot(light, BT709_LUMINANCE);
  float scale = luminance > 0.0 ? rolledOff(luminance, tone) / luminance : 1.0;
  return min(pow(light * scale, vec3(1.0 / tone.exponent)), vec3(1.0));
}

bool isHlg(int i) {
  return uLensConversion[i] == CONVERSION_HLG_TO_SDR_BT709;
}

// Lens i's texel where its exposure is a factor; as recorded for any kind but HLG.
vec3 exposureSignalOf(int i, vec3 texel) {
  vec3 recorded = uLensMatrixCorrection[i] * texel;
  if (!isHlg(i)) return recorded;
  // A corrected texel may fall just outside the signal: below black, which the square segment
  // would make light, or past white, which the log segment would make brighter than HLG encodes.
  recorded = clamp(recorded, 0.0, 1.0);
  vec3 scene = vec3(
    hlgInverseOetf(recorded.r),
    hlgInverseOetf(recorded.g),
    hlgInverseOetf(recorded.b)
  );
  vec3 light = max(uLensGamut[i] * scene, 0.0);
  return pow(light, vec3(1.0 / toneOf(i).exponent));
}

// An exposure signal of lens i as the display shows it; as recorded for any kind but HLG.
vec3 shownOf(int i, vec3 signal) {
  if (!isHlg(i)) return signal;
  return tonedFrom(signal, toneOf(i));
}

vec3 toDisplay(int i, vec3 texel) {
  return shownOf(i, exposureSignalOf(i, texel));
}
