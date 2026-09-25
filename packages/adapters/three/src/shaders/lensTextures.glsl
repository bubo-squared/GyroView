// Where each lens's image is: the decoded frames as textures, and each lens's region of its
// frame. Every program that reads a lens needs these.
uniform int uLensCount;
uniform vec4 uLensRegion[MAX_LENSES];
uniform int uLensTexture[MAX_LENSES];
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;

vec4 sampleLens(int textureIndex, vec2 uv) {
  return textureIndex == 0
    ? texture(uTexture0, uv)
    : texture(uTexture1, uv);
}
