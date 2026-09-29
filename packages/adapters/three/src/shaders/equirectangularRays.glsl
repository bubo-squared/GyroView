// An equirectangular picture: a full turn across and a half turn from top to bottom.

// Direction in view space (x right, y down, z forward) seen through a point of the picture, given
// as fractions of the picture from its top-left corner.
vec3 rayThroughPicture(vec2 point) {
  vec2 centred = point * 2.0 - 1.0;
  float yaw = centred.x * PI;
  float pitch = -centred.y * HALF_PI;
  return vec3(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch));
}
