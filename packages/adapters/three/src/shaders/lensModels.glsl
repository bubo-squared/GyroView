// The depth is positive for every direction inside a lens's field; directions behind it are
// projected too, for the footprint's derivatives, and must not divide by zero.
const float MIN_DEPTH = 1e-3;

// The distortion of a Mei lens as the core's MeiDistortion holds it, each family by increasing
// order: radial terms k1, k2, ... of r², Brown's tangential pairs (p1, p2) scaled by r^(2j), and
// thin-prism shifts scaled by r^(2j + 2). The orders a lens does not fill are zero.
struct MeiDistortion {
  float radial[MEI_RADIAL_TERMS];
  vec2 tangential[MEI_TANGENTIAL_ORDERS];
  vec2 thinPrism[MEI_THIN_PRISM_ORDERS];
};

struct MeiLens {
  float xi;
  vec2 focal;
  vec2 principalPoint;
  MeiDistortion distortion;
};

// c0 + c1 r² + c2 r⁴ + ... of each family's terms, by Horner's rule, as the core's seriesIn.
float radialSeries(float terms[MEI_RADIAL_TERMS], float r2) {
  float sum = 0.0;
  for (int j = MEI_RADIAL_TERMS - 1; j >= 0; j--) {
    sum = sum * r2 + terms[j];
  }
  return sum;
}

vec2 tangentialSeries(vec2 terms[MEI_TANGENTIAL_ORDERS], float r2) {
  vec2 sum = vec2(0.0);
  for (int j = MEI_TANGENTIAL_ORDERS - 1; j >= 0; j--) {
    sum = sum * r2 + terms[j];
  }
  return sum;
}

vec2 thinPrismSeries(vec2 terms[MEI_THIN_PRISM_ORDERS], float r2) {
  vec2 sum = vec2(0.0);
  for (int j = MEI_THIN_PRISM_ORDERS - 1; j >= 0; j--) {
    sum = sum * r2 + terms[j];
  }
  return sum;
}

// A normalised image-plane point distorted, as the core's distortMei.
vec2 distortMei(vec2 m, MeiDistortion distortion) {
  float r2 = dot(m, m);
  float radialFactor = 1.0 + r2 * radialSeries(distortion.radial, r2);
  vec2 decentering = tangentialSeries(distortion.tangential, r2);
  vec2 tangentialTerm = vec2(
    2.0 * decentering.x * m.x * m.y + decentering.y * (r2 + 2.0 * m.x * m.x),
    decentering.x * (r2 + 2.0 * m.y * m.y) + 2.0 * decentering.y * m.x * m.y
  );
  return radialFactor * m + tangentialTerm + r2 * thinPrismSeries(distortion.thinPrism, r2);
}

// Canvas pixel of a unit direction in the lens frame under the unified (Mei) model: project onto
// the unit sphere, then from xi behind its centre onto the image plane, distort, scale.
vec2 projectMei(vec3 d, MeiLens lens) {
  float depth = max(d.z + lens.xi, MIN_DEPTH);
  return lens.focal * distortMei(d.xy / depth, lens.distortion) + lens.principalPoint;
}

// Canvas pixel of a unit direction under a radial polynomial in the angle from the optical axis.
vec2 projectRadialPolynomial(vec3 d, float theta, vec4 c, vec2 principalPoint) {
  float radius = theta * (c.x + theta * (c.y + theta * (c.z + theta * c.w)));
  float lateral = length(d.xy);
  vec2 unit = lateral > 0.0 ? d.xy / lateral : vec2(0.0);
  return principalPoint + radius * unit;
}
