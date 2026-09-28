// One texel per azimuth bin of the seam strip and slide: how much lens 0, its sampling slid
// across the ring by the slide, disagrees with lens 1 along the bin, as the mean absolute luma
// difference over the directions both image, each capped; and the share of the bin's directions
// both image. Rows are slides, read from a float texture, one texel each. Each cell of the strip
// is sampled on a sub-grid, so the cost sees the frames' own texture. The two bytes of the
// mismatch (as a share of the cap) go out in red and green, the validity in blue, so no float
// render target is needed.
uniform int uSlideCount;
uniform sampler2D uSlides;
uniform vec3 uMismatchGain[MAX_LENSES];
uniform float uMismatchCap;

out vec4 outColor;

// Rec. 601 luma of gamma-encoded RGB, as omnikit compares the lenses.
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
// Each sub-sample at the centre of its share of the cell.
const float SUB_SAMPLE_CENTRE = 0.5;
// The 16-bit code of the mismatch in two 8-bit channels, as decodeBinCosts reads it.
const float CODE_MAX = float(MISMATCH_CODE_MAX);
const float BYTE_VALUES = float(MISMATCH_BYTE_VALUES);
const float CHANNEL_MAX = float(MISMATCH_CHANNEL_MAX);

float slideAt(int row) {
  return texelFetch(uSlides, ivec2(0, row), 0).x;
}

// The azimuth (from body +x towards +y) and the angle from body +z of one sub-sample of a
// strip cell: the cell's span divided evenly.
vec2 stripAngles(ivec2 cell, ivec2 sub) {
  float subStep = SEAM_STRIP_STEP_RADIANS / float(SEAM_CELL_SUBSAMPLES);
  vec2 start = vec2(0.0, SEAM_STRIP_THETA_START_RADIANS);
  return start + vec2(cell) * SEAM_STRIP_STEP_RADIANS + (vec2(sub) + SUB_SAMPLE_CENTRE) * subStep;
}

vec3 directionOf(vec2 angles) {
  return vec3(sin(angles.y) * cos(angles.x), sin(angles.y) * sin(angles.x), cos(angles.y));
}

float lumaOf(int i, vec3 dirBody, out bool isImaged) {
  LensSample seen = sampleLensWith(i, dirBody, SAMPLING_BILINEAR);
  isImaged = seen.isImaged;
  return dot(uMismatchGain[i] * seen.color, LUMA);
}

vec4 encode(float mismatchOfCap, float validity) {
  float code = floor(mismatchOfCap * CODE_MAX + 0.5);
  float high = floor(code / BYTE_VALUES);
  float low = mod(code, BYTE_VALUES);
  return vec4(high / CHANNEL_MAX, low / CHANNEL_MAX, validity, 1.0);
}

void main() {
  int bin = int(gl_FragCoord.x);
  int row = int(gl_FragCoord.y);
  if (row >= uSlideCount || uLensCount < 2) {
    outColor = vec4(0.0);
    return;
  }
  vec2 slide = vec2(0.0, slideAt(row));
  float sum = 0.0;
  int imaged = 0;
  int samples = SEAM_BIN_COLUMNS * SEAM_STRIP_ROWS * SEAM_CELL_SUBSAMPLES * SEAM_CELL_SUBSAMPLES;
  for (int column = 0; column < SEAM_BIN_COLUMNS; column++) {
    for (int stripRow = 0; stripRow < SEAM_STRIP_ROWS; stripRow++) {
      ivec2 cell = ivec2(bin * SEAM_BIN_COLUMNS + column, stripRow);
      for (int subColumn = 0; subColumn < SEAM_CELL_SUBSAMPLES; subColumn++) {
        for (int subRow = 0; subRow < SEAM_CELL_SUBSAMPLES; subRow++) {
          vec2 angles = stripAngles(cell, ivec2(subColumn, subRow));
          bool seesSlid;
          bool seesOther;
          float slidLuma = lumaOf(0, directionOf(angles + slide), seesSlid);
          float otherLuma = lumaOf(1, directionOf(angles), seesOther);
          if (!(seesSlid && seesOther)) continue;
          sum += min(abs(slidLuma - otherLuma), uMismatchCap);
          imaged++;
        }
      }
    }
  }
  float mismatchOfCap = imaged > 0 ? sum / float(imaged) / uMismatchCap : 0.0;
  outColor = encode(mismatchOfCap, float(imaged) / float(samples));
}
