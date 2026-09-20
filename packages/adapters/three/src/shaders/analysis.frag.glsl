in vec2 vNdc;
out vec4 outColor;

// One row per lens: what that lens sees along the seam ring, the circle of body directions
// halfway through the blend band around lens 0's axis, sampled around the ring along x. Rows
// share their directions, so their means differ by exposure (and parallax), not by content.
// Alpha marks the texels a lens actually images.
void main() {
  int lens = int(floor((vNdc.y + 1.0) * 0.5 * float(MAX_LENSES)));
  float phi = (vNdc.x + 1.0) * PI;
  float ring = 0.5 * (uFeather.x + uFeather.y);
  vec3 dirBody = vec3(sin(ring) * cos(phi), sin(ring) * sin(phi), cos(ring));
  if (lens >= uLensCount) {
    outColor = vec4(0.0);
    return;
  }
  LensSample seen = sampleLensAt(lens, dirBody);
  outColor = seen.isImaged ? vec4(seen.color.rgb, 1.0) : vec4(0.0);
}
