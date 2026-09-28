// How a body direction becomes a texel of one lens, for the stitch and the seam meters: the
// calibration as uniforms, and the sampling through each lens model. Needs lensTextures.glsl.
uniform vec2 uFeather;
uniform mat3 uLensRotation[MAX_LENSES];
uniform int uLensKind[MAX_LENSES];
uniform vec2 uLensPrincipalPoint[MAX_LENSES];
uniform vec2 uLensFocal[MAX_LENSES];
uniform float uLensXi[MAX_LENSES];
uniform vec3 uLensRadial[MAX_LENSES];
uniform vec2 uLensTangential[MAX_LENSES];
uniform vec4 uLensPolynomial[MAX_LENSES];
uniform float uLensHalfFov[MAX_LENSES];
uniform vec4 uLensWindow[MAX_LENSES];

struct LensSample {
  bool isImaged;
  // Angle from the lens's optical axis.
  float theta;
  vec3 color;
};

// Where lens i images direction d on its calibration canvas; the principal point, and not
// known, for a kind of lens this shader does not know.
vec2 canvasPixel(int i, vec3 d, float theta, out bool isKnown) {
  isKnown = true;
  if (uLensKind[i] == LENS_MEI) {
    return projectMei(
      d,
      uLensXi[i],
      uLensFocal[i],
      uLensPrincipalPoint[i],
      uLensRadial[i],
      uLensTangential[i]
    );
  }
  if (uLensKind[i] == LENS_RADIAL_POLYNOMIAL) {
    return projectRadialPolynomial(d, theta, uLensPolynomial[i], uLensPrincipalPoint[i]);
  }
  isKnown = false;
  return uLensPrincipalPoint[i];
}

// What lens i shows in a body direction through a given body-to-lens rotation, read as
// `sampling` says, if it images it at all: outside its field, or beyond the window the frame
// shows, nothing. The footprint is taken in every fragment before the gates, so its
// derivatives are defined.
LensSample sampleLensWith(int i, mat3 rotation, vec3 dirBody, int sampling) {
  vec3 d = rotation * dirBody;
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
  result.color = result.isImaged ? sampleLens(uLensTexture[i], footprint, sampling).rgb : vec3(0.0);
  return result;
}

// What lens i shows in a body direction through its own pose, read as the picture is.
LensSample sampleLensAt(int i, vec3 dirBody) {
  return sampleLensWith(i, uLensRotation[i], dirBody, uSampling);
}
