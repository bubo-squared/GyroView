// The fixed join: every lens read where the calibration's template reads it, for an infinitely
// far scene, and blended across the whole feather band. The stitch the player draws; the lab's
// bent join (ADR 0026) implements the same three functions.
float disparityAt(vec3 dirBody) {
  return 0.0;
}

vec3 seamReadDirection(int i, vec3 dirBody, float disparity) {
  return dirBody;
}

vec2 seamFeather(float disparity) {
  return uFeather;
}
