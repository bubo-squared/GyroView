const float PI = 3.14159265358979;

// Direction in view space (x right, y down, z forward) seen through a screen point in normalised
// device coordinates. Screen y points up, view y points down. The perspective projections scale
// the image plane so that the horizontal field of view means what the view state says; the
// equirectangular one always shows the whole sphere, whatever the viewport's aspect.
vec3 rayFromNdc(vec2 ndc, int projection, float planeHalfExtent, float aspect) {
  vec2 screen = vec2(ndc.x, -ndc.y);
  if (projection == PROJECTION_EQUIRECTANGULAR) {
    float yaw = screen.x * PI;
    float pitch = -screen.y * PI * 0.5;
    return vec3(sin(yaw) * cos(pitch), -sin(pitch), cos(yaw) * cos(pitch));
  }
  vec2 plane = vec2(screen.x * planeHalfExtent, screen.y * planeHalfExtent / aspect);
  if (projection == PROJECTION_STEREOGRAPHIC) {
    // Stereographic image radius is 2 tan(theta / 2).
    float radius = length(plane);
    float theta = 2.0 * atan(radius * 0.5);
    vec2 unit = radius > 0.0 ? plane / radius : vec2(0.0);
    return vec3(unit * sin(theta), cos(theta));
  }
  return normalize(vec3(plane, 1.0));
}
