// The stitched sphere through the picture's rays: each lens's texel for the ray, weighted across
// the feather band and matched in exposure.
uniform mat3 uViewRotation;
uniform mat3 uStabilization;
uniform vec3 uLensGain[MAX_LENSES];

in vec2 vNdc;
out vec4 outColor;

void main() {
  vec2 point = pointInArea(vNdc, uScreenArea[0]);
  if (!isInArea(point)) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 dirView = rayThroughPicture(point);
  vec3 dirBody = uStabilization * (uViewRotation * dirView);
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    // A lens silenced through its gain (ADR 0012) leaves the blend altogether, so the other
    // lens fills the feather band alone and a lens-only render shows that lens as it is.
    if (all(equal(uLensGain[i], vec3(0.0)))) continue;
    LensSample lens = sampleLensAt(i, dirBody);
    if (!lens.isImaged) continue;
    float weight = 1.0 - smoothstep(uFeather.x, uFeather.y, lens.theta);
    sum += weight * uLensGain[i] * lens.color;
    weightSum += weight;
  }
  outColor = weightSum > 0.0 ? vec4(sum / weightSum, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
