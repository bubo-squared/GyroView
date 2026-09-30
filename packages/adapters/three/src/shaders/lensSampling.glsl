// How a body direction becomes a texel of one lens, for the stitch and the seam meters: the
// calibration as uniforms, and the sampling through each lens model. Needs lensTextures.glsl.
uniform vec2 uFeather;
uniform mat3 uLensRotation[MAX_LENSES];
uniform int uLensKind[MAX_LENSES];
uniform vec2 uLensPrincipalPoint[MAX_LENSES];
uniform vec2 uLensFocal[MAX_LENSES];
uniform float uLensXi[MAX_LENSES];
// Each lens's Mei terms, lens after lens, as many per lens as the family holds room for.
uniform float uLensRadial[MAX_LENSES * MEI_RADIAL_TERMS];
uniform vec2 uLensTangential[MAX_LENSES * MEI_TANGENTIAL_ORDERS];
uniform vec2 uLensThinPrism[MAX_LENSES * MEI_THIN_PRISM_ORDERS];
uniform vec4 uLensPolynomial[MAX_LENSES];
uniform float uLensHalfFov[MAX_LENSES];
uniform vec4 uLensWindow[MAX_LENSES];

struct LensSample {
  bool isImaged;
  // Angle from the lens's optical axis.
  float theta;
  vec3 color;
};

// Lens i's Mei parameters, gathered from the per-lens uniforms.
MeiLens meiLensOf(int i) {
  float radial[MEI_RADIAL_TERMS];
  for (int j = 0; j < MEI_RADIAL_TERMS; j++) {
    radial[j] = uLensRadial[i * MEI_RADIAL_TERMS + j];
  }
  vec2 tangential[MEI_TANGENTIAL_ORDERS];
  for (int j = 0; j < MEI_TANGENTIAL_ORDERS; j++) {
    tangential[j] = uLensTangential[i * MEI_TANGENTIAL_ORDERS + j];
  }
  vec2 thinPrism[MEI_THIN_PRISM_ORDERS];
  for (int j = 0; j < MEI_THIN_PRISM_ORDERS; j++) {
    thinPrism[j] = uLensThinPrism[i * MEI_THIN_PRISM_ORDERS + j];
  }
  MeiDistortion distortion = MeiDistortion(radial, tangential, thinPrism);
  return MeiLens(uLensXi[i], uLensFocal[i], uLensPrincipalPoint[i], distortion);
}

// Where lens i images direction d on its calibration canvas; the principal point, and not
// known, for a kind of lens this shader does not know.
vec2 canvasPixel(int i, vec3 d, float theta, out bool isKnown) {
  isKnown = true;
  if (uLensKind[i] == LENS_MEI) {
    return projectMei(d, meiLensOf(i));
  }
  if (uLensKind[i] == LENS_RADIAL_POLYNOMIAL) {
    return projectRadialPolynomial(d, theta, uLensPolynomial[i], uLensPrincipalPoint[i]);
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
  result.color = result.isImaged ? sampleLens(uLensTexture[i], footprint, sampling).rgb : vec3(0.0);
  return result;
}

// What lens i shows in a body direction, read as the picture is.
LensSample sampleLensAt(int i, vec3 dirBody) {
  return sampleLensWith(i, dirBody, uSampling);
}
