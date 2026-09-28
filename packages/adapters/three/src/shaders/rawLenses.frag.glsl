// The decoded lens images on their own, unstitched: each lens's region of its frame exactly as
// the decoder delivered it, in the lens's screen area, with no pose, stabilization or gain. Black
// around the areas. Every pixel takes each tile's footprint before the area decides, so the
// derivatives are defined.
in vec2 vNdc;
out vec4 outColor;

void main() {
  vec3 color = vec3(0.0);
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec2 point = pointInArea(vNdc, uScreenArea[i]);
    Footprint footprint = footprintOf(i, point);
    if (isInArea(point)) color = sampleLens(uLensTexture[i], footprint, uSampling).rgb;
  }
  outColor = vec4(color, 1.0);
}
