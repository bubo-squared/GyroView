/**
 * A number as a GLSL float literal, with its decimal point: three.js writes a define's number as
 * JavaScript prints it, so 3 would be an int, and GLSL ES 3.00 converts no int to a float.
 */
export function glslFloat(value: number): string {
  return Number.isSafeInteger(value) ? value.toFixed(1) : String(value);
}
