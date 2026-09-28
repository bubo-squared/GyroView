// One texel per azimuth bin of the seam strip and candidate pose: how much the candidate lens,
// turned by the candidate rotation, disagrees with the other lens along the bin, as the mean
// absolute luma difference over the directions both image, each capped; and the share of the
// bin's directions both image. Rows are candidates, whose rotations come from a float texture,
// one column of the matrix per texel. The two bytes of the mismatch (as a share of the cap) go
// out in red and green, the validity in blue, so no float render target is needed.
uniform int uCandidateLens;
uniform int uCandidateCount;
uniform sampler2D uCandidates;
uniform vec3 uMismatchGain[MAX_LENSES];
uniform float uMismatchCap;

out vec4 outColor;

// Rec. 601 luma of gamma-encoded RGB, as omnikit compares the lenses.
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float CODE_MAX = 65535.0;
const float BYTE = 256.0;
const float CHANNEL_MAX = 255.0;

mat3 candidateRotation(int row) {
  return mat3(
    texelFetch(uCandidates, ivec2(0, row), 0).xyz,
    texelFetch(uCandidates, ivec2(1, row), 0).xyz,
    texelFetch(uCandidates, ivec2(2, row), 0).xyz
  );
}

// The body direction at the centre of a strip cell: azimuth from body +x towards +y, the angle
// from body +z from the strip's start.
vec3 stripDirection(int column, int row) {
  float azimuth = (float(column) + 0.5) * SEAM_STRIP_STEP_RADIANS;
  float theta = SEAM_STRIP_THETA_START_RADIANS + (float(row) + 0.5) * SEAM_STRIP_STEP_RADIANS;
  return vec3(sin(theta) * cos(azimuth), sin(theta) * sin(azimuth), cos(theta));
}

float lumaOf(int i, mat3 rotation, vec3 dirBody, out bool isImaged) {
  LensSample seen = sampleLensWith(i, rotation, dirBody);
  isImaged = seen.isImaged;
  return dot(uMismatchGain[i] * seen.color, LUMA);
}

vec4 encode(float mismatchOfCap, float validity) {
  float code = floor(mismatchOfCap * CODE_MAX + 0.5);
  return vec4(floor(code / BYTE) / CHANNEL_MAX, mod(code, BYTE) / CHANNEL_MAX, validity, 1.0);
}

void main() {
  int bin = int(gl_FragCoord.x);
  int candidate = int(gl_FragCoord.y);
  if (candidate >= uCandidateCount || uLensCount < 2) {
    outColor = vec4(0.0);
    return;
  }
  mat3 rotation = candidateRotation(candidate);
  int other = uCandidateLens == 0 ? 1 : 0;
  float sum = 0.0;
  int imaged = 0;
  for (int column = 0; column < SEAM_BIN_COLUMNS; column++) {
    for (int row = 0; row < SEAM_STRIP_ROWS; row++) {
      vec3 direction = stripDirection(bin * SEAM_BIN_COLUMNS + column, row);
      bool seesCandidate;
      bool seesOther;
      float candidateLuma = lumaOf(uCandidateLens, rotation, direction, seesCandidate);
      float otherLuma = lumaOf(other, uLensRotation[other], direction, seesOther);
      if (!(seesCandidate && seesOther)) continue;
      sum += min(abs(candidateLuma - otherLuma), uMismatchCap);
      imaged++;
    }
  }
  float cells = float(SEAM_BIN_COLUMNS * SEAM_STRIP_ROWS);
  float mismatchOfCap = imaged > 0 ? sum / float(imaged) / uMismatchCap : 0.0;
  outColor = encode(mismatchOfCap, float(imaged) / cells);
}
