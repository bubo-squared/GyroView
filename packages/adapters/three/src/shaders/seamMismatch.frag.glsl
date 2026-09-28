// One texel per azimuth bin of the seam strip and candidate: how much the candidate lens
// disagrees with the other lens along the bin, as the mean absolute luma difference over the
// directions both image, each capped; and the share of the bin's directions both image. Rows
// are candidates, read from a float texture: a rotation as three column texels, which replaces
// the candidate lens's pose; or a slide of its sampling along and across the ring, in one
// texel, its pose kept. Each cell of the strip is sampled on a sub-grid, so the cost sees the
// frames' own texture. The two bytes of the mismatch (as a share of the cap) go out in red and
// green, the validity in blue, so no float render target is needed.
uniform int uCandidateLens;
uniform int uCandidateKind;
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

vec2 candidateShift(int row) {
  return texelFetch(uCandidates, ivec2(0, row), 0).xy;
}

// The azimuth (from body +x towards +y) and the angle from body +z of one sub-sample of a
// strip cell: the cell's span divided evenly, each sub-sample at the centre of its share.
vec2 stripAngles(ivec2 cell, ivec2 sub) {
  float subStep = SEAM_STRIP_STEP_RADIANS / float(SEAM_CELL_SUBSAMPLES);
  vec2 start = vec2(0.0, SEAM_STRIP_THETA_START_RADIANS);
  return start + vec2(cell) * SEAM_STRIP_STEP_RADIANS + (vec2(sub) + 0.5) * subStep;
}

vec3 directionOf(vec2 angles) {
  return vec3(sin(angles.y) * cos(angles.x), sin(angles.y) * sin(angles.x), cos(angles.y));
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
  bool isRotation = uCandidateKind == CANDIDATE_ROTATIONS;
  mat3 rotation = isRotation ? candidateRotation(candidate) : uLensRotation[uCandidateLens];
  vec2 shift = uCandidateKind == CANDIDATE_SHIFTS ? candidateShift(candidate) : vec2(0.0);
  int other = uCandidateLens == 0 ? 1 : 0;
  float sum = 0.0;
  int imaged = 0;
  int samples = SEAM_BIN_COLUMNS * SEAM_STRIP_ROWS * SEAM_CELL_SUBSAMPLES * SEAM_CELL_SUBSAMPLES;
  for (int column = 0; column < SEAM_BIN_COLUMNS; column++) {
    for (int row = 0; row < SEAM_STRIP_ROWS; row++) {
      ivec2 cell = ivec2(bin * SEAM_BIN_COLUMNS + column, row);
      for (int subColumn = 0; subColumn < SEAM_CELL_SUBSAMPLES; subColumn++) {
        for (int subRow = 0; subRow < SEAM_CELL_SUBSAMPLES; subRow++) {
          vec2 angles = stripAngles(cell, ivec2(subColumn, subRow));
          bool seesCandidate;
          bool seesOther;
          vec3 candidateDirection = directionOf(angles + shift);
          float candidateLuma = lumaOf(uCandidateLens, rotation, candidateDirection, seesCandidate);
          float otherLuma = lumaOf(other, uLensRotation[other], directionOf(angles), seesOther);
          if (!(seesCandidate && seesOther)) continue;
          sum += min(abs(candidateLuma - otherLuma), uMismatchCap);
          imaged++;
        }
      }
    }
  }
  float mismatchOfCap = imaged > 0 ? sum / float(imaged) / uMismatchCap : 0.0;
  outColor = encode(mismatchOfCap, float(imaged) / float(samples));
}
