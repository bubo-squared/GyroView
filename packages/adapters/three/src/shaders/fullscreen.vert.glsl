// One triangle covering the whole viewport; the fragment shader does all the work.
in vec3 position;
out vec2 vNdc;

void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
