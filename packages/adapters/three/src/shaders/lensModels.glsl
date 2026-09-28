// The depth is positive for every direction inside a lens's field; directions behind it are
// projected too, for the footprint's derivatives, and must not divide by zero.
const float MIN_DEPTH = 1e-3;

// Canvas pixel of a unit direction in the lens frame under the unified (Mei) model: project onto
// the unit sphere, then from xi behind its centre onto the image plane, distort, scale.
vec2 projectMei(vec3 d, float xi, vec2 focal, vec2 principalPoint, vec3 radial, vec2 tangential) {
  float depth = max(d.z + xi, MIN_DEPTH);
  vec2 m = d.xy / depth;
  float r2 = dot(m, m);
  float radialFactor = 1.0 + radial.x * r2 + radial.y * r2 * r2 + radial.z * r2 * r2 * r2;
  vec2 tangentialTerm = vec2(
    2.0 * tangential.x * m.x * m.y + tangential.y * (r2 + 2.0 * m.x * m.x),
    tangential.x * (r2 + 2.0 * m.y * m.y) + 2.0 * tangential.y * m.x * m.y
  );
  return focal * (radialFactor * m + tangentialTerm) + principalPoint;
}

// Canvas pixel of a unit direction under a radial polynomial in the angle from the optical axis.
vec2 projectRadialPolynomial(vec3 d, float theta, vec4 c, vec2 principalPoint) {
  float radius = theta * (c.x + theta * (c.y + theta * (c.z + theta * c.w)));
  float lateral = length(d.xy);
  vec2 unit = lateral > 0.0 ? d.xy / lateral : vec2(0.0);
  return principalPoint + radius * unit;
}
