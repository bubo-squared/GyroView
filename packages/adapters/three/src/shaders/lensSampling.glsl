// How a body direction becomes a texel of one lens, for the stitch and the seam analysis: the
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
  vec4 color;
};

vec2 canvasPixel(int i, vec3 d, float theta) {
  return uLensKind[i] == LENS_MEI
    ? projectMei(
      d,
      uLensXi[i],
      uLensFocal[i],
      uLensPrincipalPoint[i],
      uLensRadial[i],
      uLensTangential[i]
    )
    : projectRadialPolynomial(d, theta, uLensPolynomial[i], uLensPrincipalPoint[i]);
}

// What lens i shows in a body direction, if it images it at all: outside its field, or beyond
// the window the frame shows, nothing.
LensSample sampleLensAt(int i, vec3 dirBody) {
  vec3 d = uLensRotation[i] * dirBody;
  // atan keeps its precision near the axis where acos loses it.
  float theta = atan(length(d.xy), d.z);
  LensSample result;
  result.isImaged = false;
  result.theta = theta;
  result.color = vec4(0.0);
  if (theta >= uLensHalfFov[i]) return result;
  vec2 uv = (canvasPixel(i, d, theta) - uLensWindow[i].xy) / uLensWindow[i].zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return result;
  vec2 texel = uLensRegion[i].xy + uv * uLensRegion[i].zw;
  result.isImaged = true;
  result.color = sampleLens(uLensTexture[i], texel);
  return result;
}
