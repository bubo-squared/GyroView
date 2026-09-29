// The decoded lens images on their own, unstitched: each lens's region of its frame exactly as
// the decoder delivered it, in the lens's screen area, with no pose, stabilization or gain. Black
// around the areas. Every pixel reads every tile, and the area picks one without a branch: a
// read inside a branch that some pixels of a 2x2 quad skip took a far too coarse footprint on
// Apple GPUs (Chrome through Metal), a grey line along a tile's edge wherever the edge fell
// inside a quad.
in vec2 vNdc;
out vec4 outColor;

void main() {
  vec3 color = vec3(0.0);
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec2 point = pointInArea(vNdc, uScreenArea[i]);
    Footprint footprint = footprintOf(i, point);
    vec3 sampled = sampleLens(uLensTexture[i], footprint, uSampling).rgb;
    color = mix(color, sampled, float(isInArea(point)));
  }
  outColor = vec4(color, 1.0);
}
