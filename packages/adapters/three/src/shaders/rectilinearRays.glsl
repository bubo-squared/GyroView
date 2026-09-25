// A rectilinear picture: the image plane scaled so that the horizontal field of view means what
// the picture says.
uniform float uPlaneHalfExtent;
uniform float uPictureAspect;

// Direction in view space (x right, y down, z forward) seen through a point of the picture, given
// as fractions of the picture from its top-left corner.
vec3 rayThroughPicture(vec2 point) {
  vec2 centred = point * 2.0 - 1.0;
  vec2 plane = vec2(centred.x * uPlaneHalfExtent, centred.y * uPlaneHalfExtent / uPictureAspect);
  return normalize(vec3(plane, 1.0));
}
