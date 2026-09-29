// The bent join (ADR 0026): where each lens is read for a body direction and across which band
// the lenses are blended, at the seam ring SEAM_RING_RADIANS from body +z. The disparity per
// azimuth bin, SEAM_BINS_PER_VECTOR bins to a vector, is how much farther from lens 0's axis
// lens 0 sees what lens 1 sees. Under the fixed join it reads as the fixed join chunk does.
uniform int uSeamJoin;
uniform vec4 uSeamDisparity[SEAM_BIN_COUNT / SEAM_BINS_PER_VECTOR];

// Closer to the axis than this, a direction has no azimuth to speak of; no bend reaches there.
const float AXIS_NEIGHBOURHOOD = 1e-6;
// A bin's disparity holds at its centre.
const float BIN_CENTRE = 0.5;
// Each lens takes half the bend.
const float HALF_EACH = 0.5;

// The disparity of a bin, `bin` running from -1 to SEAM_BIN_COUNT around the ring: the two
// neighbours of the first and the last bins wrap to the other end.
float binDisparity(int bin) {
  int wrapped = (bin + SEAM_BIN_COUNT) % SEAM_BIN_COUNT;
  return uSeamDisparity[wrapped / SEAM_BINS_PER_VECTOR][wrapped % SEAM_BINS_PER_VECTOR];
}

// The disparity at a body direction's azimuth (from body +x towards +y), between the centres of
// the two nearest bins.
float disparityAt(vec3 dirBody) {
  if (length(dirBody.xy) < AXIS_NEIGHBOURHOOD) return 0.0;
  float azimuth = atan(dirBody.y, dirBody.x);
  float position = (azimuth < 0.0 ? azimuth + TWO_PI : azimuth) / SEAM_BIN_WIDTH_RADIANS;
  float fromCentre = position - BIN_CENTRE;
  float below = floor(fromCentre);
  return mix(binDisparity(int(below)), binDisparity(int(below) + 1), fromCentre - below);
}

// How far the join moves the lenses' images apart at the seam: the disparity, as far as
// SEAM_MAX_BEND_RADIANS allows; nothing under the fixed join.
float seamBend(float disparity) {
  if (uSeamJoin != SEAM_JOIN_BENT) return 0.0;
  return clamp(disparity, -SEAM_MAX_BEND_RADIANS, SEAM_MAX_BEND_RADIANS);
}

// Where lens i is read for a body direction: moved across the ring by half the bend, lens 0 away
// from its axis and lens 1 towards it, wholly at the seam and beyond it, and less towards the
// lens's own side, down to nothing SEAM_BEND_WIDTH_RADIANS from the seam.
vec3 seamReadDirection(int i, vec3 dirBody, float disparity) {
  float across = length(dirBody.xy);
  float bend = seamBend(disparity);
  if (bend == 0.0 || across < AXIS_NEIGHBOURHOOD) return dirBody;
  float theta = atan(across, dirBody.z);
  float ramp =
    i == 0
      ? smoothstep(SEAM_RING_RADIANS - SEAM_BEND_WIDTH_RADIANS, SEAM_RING_RADIANS, theta)
      : 1.0 - smoothstep(SEAM_RING_RADIANS, SEAM_RING_RADIANS + SEAM_BEND_WIDTH_RADIANS, theta);
  float bent = theta + (i == 0 ? HALF_EACH : -HALF_EACH) * bend * ramp;
  return vec3(dirBody.xy / across * sin(bent), cos(bent));
}

// The band the lenses are blended across, in the angle from each lens's own axis where it is
// read, centred on the seam ring. In the bent join it narrows as the disparity no bend takes up
// grows, a clean cut instead of a double image; since a lens bent away from its axis is read that
// much nearer its rim, the band keeps half the bend on each side beyond
// SEAM_CUT_HALF_WIDTH_RADIANS, and the lenses still meet.
vec2 seamFeather(float disparity) {
  if (uSeamJoin != SEAM_JOIN_BENT) return uFeather;
  float bend = seamBend(disparity);
  float narrowing = clamp(abs(disparity - bend) / SEAM_CUT_DISPARITY_RADIANS, 0.0, 1.0);
  float narrowest = SEAM_CUT_HALF_WIDTH_RADIANS + HALF_EACH * max(bend, 0.0);
  float halfWidth = mix(0.5 * (uFeather.y - uFeather.x), narrowest, narrowing);
  return vec2(SEAM_RING_RADIANS - halfWidth, SEAM_RING_RADIANS + halfWidth);
}
