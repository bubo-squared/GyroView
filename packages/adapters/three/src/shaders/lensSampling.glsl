// How a body direction becomes a texel of one lens, for the stitch and the seam meters: the
// pose and field as uniforms, and the sampling through each lens model, the texel as its
// exposure signal. Needs lensTextures.glsl, displayConversion.glsl and lensModels.glsl.
uniform vec2 uFeather;
uniform mat3 uLensRotation[MAX_LENSES];
uniform int uLensKind[MAX_LENSES];
uniform float uLensHalfFov[MAX_LENSES];
uniform vec4 uLensWindow[MAX_LENSES];

struct LensSample {
  bool isImaged;
  // Angle from the lens's optical axis.
  float theta;
  // The texel where the lens's exposure is a factor (displayConversion.glsl).
  vec3 signal;
};

// Where lens i images direction d on its calibration canvas; the principal point, and not
// known, for a kind of lens this shader does not know.
vec2 canvasPixel(int i, vec3 d, float theta, out bool isKnown) {
  isKnown = true;
  if (uLensKind[i] == LENS_MEI) {
    return projectMei(i, d);
  }
  if (uLensKind[i] == LENS_RADIAL_POLYNOMIAL) {
    return projectRadialPolynomial(i, d, theta);
  }
  isKnown = false;
  return uLensPrincipalPoint[i];
}

// What lens i shows in a body direction, read as `sampling` says, if it images it at all:
// outside its field, or beyond the window the frame shows, nothing. The footprint is taken in
// every fragment before the gates, so its derivatives are defined.
LensSample sampleLensWith(int i, vec3 dirBody, int sampling) {
  vec3 d = uLensRotation[i] * dirBody;
  // atan keeps its precision near the axis where acos loses it.
  float theta = atan(length(d.xy), d.z);
  bool isKnown;
  vec2 pixel = canvasPixel(i, d, theta, isKnown);
  vec2 windowUv = (pixel - uLensWindow[i].xy) / uLensWindow[i].zw;
  Footprint footprint = footprintOf(i, windowUv);
  bool isInWindow =
    all(greaterThanEqual(windowUv, vec2(0.0))) && all(lessThanEqual(windowUv, vec2(1.0)));
  LensSample result;
  result.theta = theta;
  result.isImaged = isKnown && theta < uLensHalfFov[i] && isInWindow;
  result.signal = result.isImaged
    ? exposureSignalOf(i, sampleLens(uLensTexture[i], footprint, sampling).rgb)
    : vec3(0.0);
  return result;
}

// What lens i shows in a body direction, read as the picture is.
LensSample sampleLensAt(int i, vec3 dirBody) {
  return sampleLensWith(i, dirBody, uSampling);
}
