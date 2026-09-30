// The depth is positive for every direction inside a lens's field; directions behind it are
// projected too, for the footprint's derivatives, and must not divide by zero.
const float MIN_DEPTH = 1e-3;

uniform vec2 uLensPrincipalPoint[MAX_LENSES];
uniform vec2 uLensFocal[MAX_LENSES];
uniform float uLensXi[MAX_LENSES];
// Each Mei lens's distortion as the core's MeiDistortion holds it, lens after lens, as many terms
// per lens as each family holds room for, by increasing order: radial terms k1, k2, ... of r²,
// Brown's tangential pairs (p1, p2) scaled by r^(2j), and thin-prism shifts scaled by r^(2j + 2).
// The orders a lens does not fill are zero.
uniform float uLensRadial[MAX_LENSES * MEI_RADIAL_TERMS];
uniform vec2 uLensTangential[MAX_LENSES * MEI_TANGENTIAL_ORDERS];
uniform vec2 uLensThinPrism[MAX_LENSES * MEI_THIN_PRISM_ORDERS];
uniform vec4 uLensPolynomial[MAX_LENSES];

// c0 + c1 r² + c2 r⁴ + ... of each of lens i's families, by Horner's rule, as the core's seriesIn.
float radialSeries(int i, float r2) {
  float sum = 0.0;
  for (int j = MEI_RADIAL_TERMS - 1; j >= 0; j--) {
    sum = sum * r2 + uLensRadial[i * MEI_RADIAL_TERMS + j];
  }
  return sum;
}

vec2 tangentialSeries(int i, float r2) {
  vec2 sum = vec2(0.0);
  for (int j = MEI_TANGENTIAL_ORDERS - 1; j >= 0; j--) {
    sum = sum * r2 + uLensTangential[i * MEI_TANGENTIAL_ORDERS + j];
  }
  return sum;
}

vec2 thinPrismSeries(int i, float r2) {
  vec2 sum = vec2(0.0);
  for (int j = MEI_THIN_PRISM_ORDERS - 1; j >= 0; j--) {
    sum = sum * r2 + uLensThinPrism[i * MEI_THIN_PRISM_ORDERS + j];
  }
  return sum;
}

// A normalised image-plane point distorted by lens i, as the core's distortMei.
vec2 distortMei(int i, vec2 m) {
  float r2 = dot(m, m);
  float radialFactor = 1.0 + r2 * radialSeries(i, r2);
  vec2 decentering = tangentialSeries(i, r2);
  vec2 tangentialTerm = vec2(
    2.0 * decentering.x * m.x * m.y + decentering.y * (r2 + 2.0 * m.x * m.x),
    decentering.x * (r2 + 2.0 * m.y * m.y) + 2.0 * decentering.y * m.x * m.y
  );
  return radialFactor * m + tangentialTerm + r2 * thinPrismSeries(i, r2);
}

// Canvas pixel of a unit direction in lens i's frame under the unified (Mei) model: project onto
// the unit sphere, then from xi behind its centre onto the image plane, distort, scale.
vec2 projectMei(int i, vec3 d) {
  float depth = max(d.z + uLensXi[i], MIN_DEPTH);
  return uLensFocal[i] * distortMei(i, d.xy / depth) + uLensPrincipalPoint[i];
}

// Canvas pixel of a unit direction under lens i's radial polynomial in the angle from its axis.
vec2 projectRadialPolynomial(int i, vec3 d, float theta) {
  vec4 c = uLensPolynomial[i];
  float radius = theta * (c.x + theta * (c.y + theta * (c.z + theta * c.w)));
  float lateral = length(d.xy);
  vec2 unit = lateral > 0.0 ? d.xy / lateral : vec2(0.0);
  return uLensPrincipalPoint[i] + radius * unit;
}
