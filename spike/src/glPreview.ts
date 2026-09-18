// Uploads decoded frames to WebGL2 textures and draws them side by side, timing the CPU cost.

const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D lensA;
uniform sampler2D lensB;
out vec4 color;
void main() {
  vec2 flipped = vec2(uv.x, 1.0 - uv.y);
  color = flipped.x < 0.5 ? texture(lensA, vec2(flipped.x * 2.0, flipped.y)) : texture(lensB, vec2(flipped.x * 2.0 - 1.0, flipped.y));
}`;

export interface UploadMetrics {
  uploads: number;
  totalUploadMs: number;
  maxUploadMs: number;
  maxTextureSize: number;
}

export class GlPreview {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures: WebGLTexture[];
  private readonly metrics: UploadMetrics;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.textures = [this.createTexture(), this.createTexture()];
    this.metrics = { uploads: 0, totalUploadMs: 0, maxUploadMs: 0, maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number };
    this.installProgram();
  }

  uploadAndDraw(frames: VideoFrame[]): void {
    const { gl } = this;
    const started = performance.now();
    frames.forEach((frame, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[index] ?? null);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const elapsed = performance.now() - started;
    this.metrics.uploads += 1;
    this.metrics.totalUploadMs += elapsed;
    this.metrics.maxUploadMs = Math.max(this.metrics.maxUploadMs, elapsed);
  }

  report(): UploadMetrics & { averageUploadMs: number } {
    return { ...this.metrics, averageUploadMs: this.metrics.uploads ? this.metrics.totalUploadMs / this.metrics.uploads : 0 };
  }

  private createTexture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private installProgram(): void {
    const { gl } = this;
    const program = gl.createProgram();
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'lensA'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'lensB'), 1);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  private compile(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('createShader failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
    return shader;
  }
}
