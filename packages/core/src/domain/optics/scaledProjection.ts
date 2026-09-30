import type { LensProjectionParameters } from './LensModel';

/**
 * The projection with every image radius multiplied by `scale` about the principal point: the
 * Mei model's focal lengths, or the radial polynomial's coefficients. Exact at a scale of 1.
 */
export function scaledProjection(
  projection: LensProjectionParameters,
  scale: number,
): LensProjectionParameters {
  switch (projection.kind) {
    case 'mei': {
      const [fx, fy] = projection.focal;
      return { ...projection, focal: [fx * scale, fy * scale] };
    }
    case 'radial-polynomial': {
      const [c1, c2, c3, c4] = projection.coefficients;
      return { ...projection, coefficients: [c1 * scale, c2 * scale, c3 * scale, c4 * scale] };
    }
  }
}
