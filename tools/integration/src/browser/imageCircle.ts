import { degreesToRadians, QUARTER_TURN, type FrameRegion } from '@gyroview/core';

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface Circle {
  readonly centre: PixelPoint;
  readonly radius: number;
}

export interface ImageCircle extends Circle {
  /**
   * Rim points the fit kept after trimming, and their root-mean-square distance from the circle.
   */
  readonly pointCount: number;
  readonly rmsResidual: number;
}

/**
 * The rim is looked for along rays from the region centre towards each corner, this far to
 * either side of the diagonal, in steps of this angle.
 */
const CORNER_SPREAD_RADIANS = 0.3;
const RAY_STEP_RADIANS = 0.005;
/**
 * Rays start beyond the inscribed circle (where the corners are black) and walk inwards; the
 * rim is the first pixel whose colour sum exceeds this, above the glow lenses leak into the
 * black corners.
 */
const OUTER_RADIUS_FRACTION = 0.72;
const INNER_RADIUS_FRACTION = 0.45;
const RIM_THRESHOLD = 90;
const RADIUS_STEP = 0.5;
const CHANNELS = 4;
const CORNER_COUNT = 4;
const QUARTER_TURN_RADIANS = degreesToRadians(QUARTER_TURN);
const FIRST_DIAGONAL = QUARTER_TURN_RADIANS / 2;
const TRIMMING_PASSES = 3;
const TRIM_SIGMAS = 2;
const MIN_TRIM_DISTANCE = 1.5;

/**
 * The fisheye image circle inside one region of a decoded frame: a circle fitted to where the
 * black corners end along rays through each corner. Scene content does not move it, only the
 * lens does, so it locates the optical axis in the frame independently of the calibration.
 */
export function imageCircleOf(frame: VideoFrame, region: FrameRegion): ImageCircle {
  const luminance = regionLuminance(frame, region);
  const points = rimPoints(luminance);
  return fitTrimmed(points);
}

interface Luminance {
  readonly width: number;
  readonly height: number;
  at(x: number, y: number): number;
}

function regionLuminance(frame: VideoFrame, region: FrameRegion): Luminance {
  const width = Math.round(region.width * frame.displayWidth);
  const height = Math.round(region.height * frame.displayHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('no 2d context');
  const x = region.x * frame.displayWidth;
  const y = region.y * frame.displayHeight;
  context.drawImage(frame, x, y, width, height, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    at: (column, row): number => {
      const offset = (row * width + column) * CHANNELS;
      return (data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0);
    },
  };
}

function rimPoints(luminance: Luminance): PixelPoint[] {
  const points: PixelPoint[] = [];
  for (let corner = 0; corner < CORNER_COUNT; corner += 1) {
    const diagonal = FIRST_DIAGONAL + corner * QUARTER_TURN_RADIANS;
    const from = diagonal - CORNER_SPREAD_RADIANS;
    const to = diagonal + CORNER_SPREAD_RADIANS;
    for (let angle = from; angle <= to; angle += RAY_STEP_RADIANS) {
      const rim = rimAlong(luminance, angle);
      if (rim) points.push(rim);
    }
  }
  return points;
}

/**
 * Walks one ray inwards from the corner region until the picture begins.
 */
function rimAlong(luminance: Luminance, angle: number): PixelPoint | undefined {
  const centre = { x: luminance.width / 2, y: luminance.height / 2 };
  const outer = luminance.width * OUTER_RADIUS_FRACTION;
  const inner = luminance.width * INNER_RADIUS_FRACTION;
  for (let radius = outer; radius >= inner; radius -= RADIUS_STEP) {
    const x = centre.x + Math.cos(angle) * radius;
    const y = centre.y + Math.sin(angle) * radius;
    if (!isInside(luminance, x, y)) continue;
    if (luminance.at(Math.round(x), Math.round(y)) > RIM_THRESHOLD) return { x, y };
  }
  return undefined;
}

function isInside(luminance: Luminance, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < luminance.width - 1 && y < luminance.height - 1;
}

/**
 * Least-squares circle through the points, refitted without the points that lie furthest from
 * it: a bright halo or glare in one corner must not pull the centre.
 */
function fitTrimmed(points: readonly PixelPoint[]): ImageCircle {
  let kept = [...points];
  let circle = fitCircle(kept);
  for (let pass = 0; pass < TRIMMING_PASSES; pass += 1) {
    const residuals = kept.map((point) => residualOf(circle, point));
    const limit = Math.max(MIN_TRIM_DISTANCE, TRIM_SIGMAS * rootMeanSquare(residuals));
    kept = kept.filter((_point, index) => Math.abs(residuals[index] ?? 0) <= limit);
    circle = fitCircle(kept);
  }
  const rmsResidual = rootMeanSquare(kept.map((point) => residualOf(circle, point)));
  return { ...circle, pointCount: kept.length, rmsResidual };
}

function residualOf(circle: Circle, point: PixelPoint): number {
  return Math.hypot(point.x - circle.centre.x, point.y - circle.centre.y) - circle.radius;
}

function rootMeanSquare(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value * value, 0);
  return Math.sqrt(total / Math.max(1, values.length));
}

/**
 * Least-squares circle (Kåsa fit) about the points' mean, which keeps the normal equations
 * well conditioned: with `u = x - mean(x)` and `v = y - mean(y)`, the centre solves
 * `[Suu Suv; Suv Svv] [uc; vc] = [(Suuu + Suvv) / 2; (Svvv + Suuv) / 2]`.
 */
function fitCircle(points: readonly PixelPoint[]): Circle {
  const count = Math.max(1, points.length);
  const mean = {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
  };
  const moments = { uu: 0, uv: 0, vv: 0, uuu: 0, uvv: 0, vvv: 0, uuv: 0 };
  for (const point of points) {
    const u = point.x - mean.x;
    const v = point.y - mean.y;
    moments.uu += u * u;
    moments.uv += u * v;
    moments.vv += v * v;
    moments.uuu += u * u * u;
    moments.uvv += u * v * v;
    moments.vvv += v * v * v;
    moments.uuv += u * u * v;
  }
  const rightU = (moments.uuu + moments.uvv) / 2;
  const rightV = (moments.vvv + moments.uuv) / 2;
  const determinant = moments.uu * moments.vv - moments.uv * moments.uv;
  const offsetU = (rightU * moments.vv - rightV * moments.uv) / determinant;
  const offsetV = (moments.uu * rightV - moments.uv * rightU) / determinant;
  const radius = Math.sqrt(
    offsetU * offsetU + offsetV * offsetV + (moments.uu + moments.vv) / count,
  );
  return { centre: { x: mean.x + offsetU, y: mean.y + offsetV }, radius };
}
