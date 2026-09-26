import { describe, expect, it } from 'vitest';

import { aspectOfArea, directionAt, planeHalfExtentOf, rayThroughPicture } from './rectilinear';
import { DEFAULT_VIEW } from './ViewState';
import type { Vector3 } from '../../shared/math/Vector3';
import { degrees } from '../../shared/units/angle';

function normalised([x, y, z]: Vector3): Vector3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, value] of expected.entries()) expect(actual[index]).toBeCloseTo(value, 12);
}

describe('rectilinear pictures', () => {
  it('spread a 90-degree field of view over an image plane one unit from the centre to the edge', () => {
    expect(planeHalfExtentOf(degrees(90))).toBeCloseTo(1, 12);
    expect(planeHalfExtentOf(degrees(60))).toBeCloseTo(Math.tan(Math.PI / 6), 12);
  });

  it('look through the middle of the right edge 45 degrees to the right, at 90 degrees across', () => {
    expectVector(rayThroughPicture(degrees(90), { x: 1, y: 0.5 }, 2), normalised([1, 0, 1]));
  });

  it('look up through the top centre by half the width, the picture being half as tall', () => {
    // y points down: the top of the picture looks up.
    expectVector(rayThroughPicture(degrees(90), { x: 0.5, y: 0 }, 2), normalised([0, -0.5, 1]));
  });

  it('take the aspect of an area from the viewport it lies in', () => {
    expect(aspectOfArea({ x: 0, y: 0.25, width: 1, height: 0.5 }, 1)).toBe(2);
  });

  it('turn the ray into the camera body by the view', () => {
    const turnedRight = { ...DEFAULT_VIEW, yaw: degrees(90) };
    expectVector(directionAt(turnedRight, { x: 0.5, y: 0.5 }, 16 / 9), [1, 0, 0]);
  });
});
