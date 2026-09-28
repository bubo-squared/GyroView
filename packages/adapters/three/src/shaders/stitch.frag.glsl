// The stitched sphere through the picture's rays: each lens's texel for the ray, read and weighted
// across the feather band as the seam join says, and matched in exposure. Every pixel samples, even outside the picture's area,
// so the footprints' derivatives are defined; the area decides what shows.
uniform mat3 uViewRotation;
uniform mat3 uStabilization;
uniform vec3 uLensGain[MAX_LENSES];

in vec2 vNdc;
out vec4 outColor;

void main() {
  vec2 point = pointInArea(vNdc, uScreenArea[0]);
  vec3 dirView = rayThroughPicture(point);
  vec3 dirBody = uStabilization * (uViewRotation * dirView);
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  float disparity = disparityAt(dirBody);
  vec2 feather = seamFeather(disparity);
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    // A lens silenced through its gain (ADR 0012) leaves the blend altogether, so the other
    // lens fills the feather band alone and a lens-only render shows that lens as it is.
    if (all(equal(uLensGain[i], vec3(0.0)))) continue;
    LensSample lens = sampleLensAt(i, seamReadDirection(i, dirBody, disparity));
    if (!lens.isImaged) continue;
    // Weighed where the lens is read: a lens bent towards its rim fades out, so the band the
    // lenses share narrows by the disparity, as it does in the scene.
    float weight = 1.0 - smoothstep(feather.x, feather.y, lens.theta);
    sum += weight * uLensGain[i] * lens.color;
    weightSum += weight;
  }
  bool isShown = isInArea(point) && weightSum > 0.0;
  outColor = isShown ? vec4(sum / weightSum, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
