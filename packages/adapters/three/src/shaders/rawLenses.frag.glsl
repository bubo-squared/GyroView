// The decoded lens images on their own, unstitched: each lens's region of its frame exactly as
// the decoder delivered it, in the lens's screen area, with no pose, stabilization or gain. Black
// around the areas.
in vec2 vNdc;
out vec4 outColor;

void main() {
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= uLensCount) break;
    vec2 point = pointInArea(vNdc, uScreenArea[i]);
    if (isInArea(point)) {
      vec2 texel = uLensRegion[i].xy + point * uLensRegion[i].zw;
      outColor = vec4(sampleLens(uLensTexture[i], texel).rgb, 1.0);
      return;
    }
  }
  outColor = vec4(0.0, 0.0, 0.0, 1.0);
}
