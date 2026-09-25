// Direction in view space (x right, y down, z forward) seen through a point of the picture, given
// as fractions of the picture from its top-left corner. The normal view scales the image plane so
// that the horizontal field of view means what the view state says; the equirectangular one
// spreads a full turn across the picture and a half turn from top to bottom.
vec3 rayThroughPicture(vec2 point, int viewMode, float planeHalfExtent, float pictureAspect) {
  vec2 centred = point * 2.0 - 1.0;
  if (viewMode == VIEW_EQUIRECTANGULAR) {
    float yaw = centred.x * PI;
    float pitch = -centred.y * PI * 0.5;
    return vec3(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch));
  }
  vec2 plane = vec2(centred.x * planeHalfExtent, centred.y * planeHalfExtent / pictureAspect);
  return normalize(vec3(plane, 1.0));
}
