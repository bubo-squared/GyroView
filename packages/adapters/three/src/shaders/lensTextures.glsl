// Where each lens's image is: the decoded frames as textures, each lens's region of its frame,
// and how a screen pixel reads them. Every program that reads a lens needs these.
uniform int uLensCount;
uniform vec4 uLensRegion[MAX_LENSES];
uniform int uLensTexture[MAX_LENSES];
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;
uniform int uSampling;

// The patch of a lens image one screen pixel covers: where it is read, and how far the next
// pixel to the right and the next one down move the read, from the screen derivatives.
struct Footprint {
  vec2 uv;
  vec2 dx;
  vec2 dy;
};

vec2 texelSizeOf(int textureIndex) {
  return 1.0 / vec2(textureIndex == 0 ? textureSize(uTexture0, 0) : textureSize(uTexture1, 0));
}

// One bilinear tap of the base level, whatever the texture's filters: the seam meters read the
// frames this way, where the pixel footprint means nothing.
vec4 fetchBase(int textureIndex, vec2 uv) {
  return textureIndex == 0
    ? textureLod(uTexture0, uv, 0.0)
    : textureLod(uTexture1, uv, 0.0);
}

// One tap through the mip chain over a footprint.
vec4 fetchFootprint(int textureIndex, vec2 uv, vec2 dx, vec2 dy) {
  return textureIndex == 0
    ? textureGrad(uTexture0, uv, dx, dy)
    : textureGrad(uTexture1, uv, dx, dy);
}

// Where a fraction of a lens's region is read. The derivatives are taken here, in every
// fragment alike, before anything decides whether the pixel shows the lens at all; then the read
// point is kept half a texel inside the region, so a neighbouring region never bleeds in.
Footprint footprintOf(int i, vec2 regionUv) {
  vec2 uv = uLensRegion[i].xy + regionUv * uLensRegion[i].zw;
  Footprint footprint;
  footprint.dx = dFdx(uv);
  footprint.dy = dFdy(uv);
  vec2 inset = 0.5 * texelSizeOf(uLensTexture[i]);
  vec2 low = uLensRegion[i].xy + inset;
  vec2 high = uLensRegion[i].xy + uLensRegion[i].zw - inset;
  footprint.uv = clamp(uv, low, high);
  return footprint;
}

// Four taps on a rotated grid within the footprint, each over a quarter of it (Akenine-Möller
// et al., Real-Time Rendering, 4th ed., section 5.4.1).
const vec2 GRID_OFFSETS[4] = vec2[4](
  vec2(-0.375, 0.125),
  vec2(0.125, 0.375),
  vec2(0.375, -0.125),
  vec2(-0.125, -0.375)
);

vec4 fetchSupersampled(int textureIndex, Footprint footprint) {
  vec4 sum = vec4(0.0);
  for (int tap = 0; tap < 4; tap++) {
    vec2 uv =
      footprint.uv + GRID_OFFSETS[tap].x * footprint.dx + GRID_OFFSETS[tap].y * footprint.dy;
    sum += fetchFootprint(textureIndex, uv, 0.5 * footprint.dx, 0.5 * footprint.dy);
  }
  return 0.25 * sum;
}

vec4 sampleLens(int textureIndex, Footprint footprint, int sampling) {
  if (sampling == SAMPLING_TRILINEAR) {
    return fetchFootprint(textureIndex, footprint.uv, footprint.dx, footprint.dy);
  }
  if (sampling == SAMPLING_SUPERSAMPLED) return fetchSupersampled(textureIndex, footprint);
  return fetchBase(textureIndex, footprint.uv);
}
