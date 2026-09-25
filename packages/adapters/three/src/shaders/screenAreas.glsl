// Where on the viewport the picture goes: per area, x, y, width and height as fractions of the
// viewport from its top-left corner.
uniform vec4 uScreenArea[MAX_LENSES];

// Where a pixel lies within an area, as fractions of the area from its top-left corner: outside
// 0 to 1 when the pixel lies outside the area. Normalised device y points up, screen y down.
vec2 pointInArea(vec2 ndc, vec4 area) {
  vec2 screen = vec2(ndc.x + 1.0, 1.0 - ndc.y) * 0.5;
  return (screen - area.xy) / area.zw;
}

bool isInArea(vec2 point) {
  return all(greaterThanEqual(point, vec2(0.0))) && all(lessThanEqual(point, vec2(1.0)));
}
