uniform mat3 uViewRotation;
uniform mat3 uStabilization;
uniform int uViewMode;
uniform float uPlaneHalfExtent;
uniform float uPictureAspect;

in vec2 vNdc;
out vec4 outColor;

void main() {
  vec2 point = pointInArea(vNdc, uScreenArea[0]);
  if (!isInArea(point)) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 dirView = rayThroughPicture(point, uViewMode, uPlaneHalfExtent, uPictureAspect);
  vec3 dirBody = uStabilization * (uViewRotation * dirView);
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    LensSample lens = sampleLensAt(i, dirBody);
    if (!lens.isImaged) continue;
    float weight = 1.0 - smoothstep(uFeather.x, uFeather.y, lens.theta);
    sum += weight * uLensGain[i] * lens.color.rgb;
    weightSum += weight;
  }
  outColor = weightSum > 0.0 ? vec4(sum / weightSum, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
