#define MAX_LENSES 2

uniform int uLensCount;
uniform mat3 uViewRotation;
uniform mat3 uStabilization;
uniform int uProjection;
uniform float uTanHalfFov;
uniform float uAspect;
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
uniform vec4 uLensRegion[MAX_LENSES];
uniform int uLensTexture[MAX_LENSES];
uniform vec3 uLensGain[MAX_LENSES];
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;

in vec2 vNdc;
out vec4 outColor;

vec4 sampleLens(int textureIndex, vec2 uv) {
  return textureIndex == 0
    ? texture(uTexture0, uv)
    : texture(uTexture1, uv);
}

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

void main() {
  vec3 dirView = rayFromNdc(vNdc, uProjection, uTanHalfFov, uAspect);
  vec3 dirBody = uStabilization * (uViewRotation * dirView);
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec3 d = uLensRotation[i] * dirBody;
    float theta = acos(clamp(d.z, -1.0, 1.0));
    if (theta >= uLensHalfFov[i]) continue;
    vec2 uv = (canvasPixel(i, d, theta) - uLensWindow[i].xy) / uLensWindow[i].zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
    float weight = 1.0 - smoothstep(uFeather.x, uFeather.y, theta);
    vec2 texel = uLensRegion[i].xy + uv * uLensRegion[i].zw;
    sum += weight * uLensGain[i] * sampleLens(uLensTexture[i], texel).rgb;
    weightSum += weight;
  }
  outColor = weightSum > 0.0 ? vec4(sum / weightSum, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}
