// How the stitch joins the lenses at the seam, the ring 90 degrees from body +z: where each lens
// is read for a body direction, and across which band it is blended. The disparity per azimuth
// bin, four bins to a vector, is how much farther from lens 0's axis lens 0 sees what lens 1
// sees.
uniform int uSeamJoin;
uniform vec4 uSeamDisparity[SEAM_BIN_COUNT / 4];

const float HALF_PI = 1.5707963267948966;
const float TWO_PI = 6.283185307179586;
// Closer to the axis than this, a direction has no azimuth to speak of; no bend reaches there.
const float AXIS_NEIGHBOURHOOD = 1e-6;

float binDisparity(int bin) {
  int wrapped = (bin % SEAM_BIN_COUNT + SEAM_BIN_COUNT) % SEAM_BIN_COUNT;
  return uSeamDisparity[wrapped / 4][wrapped % 4];
}

// The disparity at a body direction's azimuth (from body +x towards +y), between the centres of
// the two nearest bins.
float disparityAt(vec3 dirBody) {
  float azimuth = atan(dirBody.y, dirBody.x);
  float position = (azimuth < 0.0 ? azimuth + TWO_PI : azimuth) / SEAM_BIN_WIDTH_RADIANS - 0.5;
  float below = floor(position);
  return mix(binDisparity(int(below)), binDisparity(int(below) + 1), position - below);
}

// How far a join moves the lenses' images apart at the seam: in a bent join the disparity, as
// far as SEAM_MAX_BEND_RADIANS allows; in the others nothing.
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
      ? smoothstep(HALF_PI - SEAM_BEND_WIDTH_RADIANS, HALF_PI, theta)
      : 1.0 - smoothstep(HALF_PI, HALF_PI + SEAM_BEND_WIDTH_RADIANS, theta);
  float bent = theta + (i == 0 ? 0.5 : -0.5) * bend * ramp;
  return vec3(dirBody.xy / across * sin(bent), cos(bent));
}

// The band, in the angle from a lens's own axis where it is read, the lenses are blended across.
// In a bent join, narrowed about its middle as the disparity no bend takes up grows, a clean cut
// instead of a double image. A lens bent away from its axis is read that much nearer its rim, so
// the band keeps half the bend on each side beyond SEAM_CUT_HALF_WIDTH_RADIANS, and the lenses
// still meet.
vec2 seamFeather(float disparity) {
  if (uSeamJoin != SEAM_JOIN_BENT) return uFeather;
  float bend = seamBend(disparity);
  float narrowing = clamp(abs(disparity - bend) / SEAM_CUT_DISPARITY_RADIANS, 0.0, 1.0);
  float narrowest = SEAM_CUT_HALF_WIDTH_RADIANS + 0.5 * max(bend, 0.0);
  float middle = 0.5 * (uFeather.x + uFeather.y);
  float halfWidth = mix(0.5 * (uFeather.y - uFeather.x), narrowest, narrowing);
  return vec2(middle - halfWidth, middle + halfWidth);
}
