import { degrees, degreesToRadians } from '@gyroview/core';

const QUARTER = 0.25;
const HALF = 0.5;
const THREE_QUARTERS = 0.75;

/**
 * The mean of the values, NaN for none.
 */
export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * The value at fraction `at` of the sorted values, between neighbours linearly.
 */
function quantileOf(sorted: readonly number[], at: number): number {
  const position = at * (sorted.length - 1);
  const below = sorted[Math.floor(position)] ?? NaN;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

export interface Quartiles {
  readonly lower: number;
  readonly median: number;
  readonly upper: number;
}

/**
 * The median and quartiles: a few values spoiled by near objects move neither.
 */
export function quartilesOf(values: readonly number[]): Quartiles {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    lower: quantileOf(sorted, QUARTER),
    median: quantileOf(sorted, HALF),
    upper: quantileOf(sorted, THREE_QUARTERS),
  };
}

/**
 * How strongly a value varies around the seam once and twice a turn, in its own unit: what a
 * wrong tangential or thin-prism term leaves in the seam's disparity, and a wrong radial scale
 * does not (it shifts every azimuth alike).
 */
export interface Harmonics {
  readonly once: number;
  readonly twice: number;
}

export interface AzimuthSample {
  readonly azimuth: number;
  readonly value: number;
}

const HARMONIC_TERMS = 5;

/**
 * The first two harmonics of values sampled at azimuths in degrees, fitted by least squares
 * with the mean; NaN with too few samples to fit them.
 */
export function harmonicsOf(samples: readonly AzimuthSample[]): Harmonics {
  if (samples.length < HARMONIC_TERMS) return { once: NaN, twice: NaN };
  const coefficients = leastSquares(
    samples.map((sample) => harmonicRow(sample.azimuth)),
    samples.map((sample) => sample.value),
  );
  const [, cosOnce = 0, sinOnce = 0, cosTwice = 0, sinTwice = 0] = coefficients;
  return { once: Math.hypot(cosOnce, sinOnce), twice: Math.hypot(cosTwice, sinTwice) };
}

function harmonicRow(azimuthDegrees: number): number[] {
  const azimuth = degreesToRadians(degrees(azimuthDegrees));
  return [1, Math.cos(azimuth), Math.sin(azimuth), Math.cos(2 * azimuth), Math.sin(2 * azimuth)];
}

/**
 * The coefficients minimising the squared residual of `rows · x = values`, through the normal
 * equations solved by Gauss-Jordan elimination.
 */
function leastSquares(rows: readonly number[][], values: readonly number[]): number[] {
  const terms = Array.from({ length: rows[0]?.length ?? 0 }, (_unused, term) => term);
  const system = terms.map((term) => [
    ...terms.map((other) => productOfColumns(rows, term, (row) => row[other] ?? 0)),
    productOfColumns(rows, term, (_row, sample) => values[sample] ?? 0),
  ]);
  return solved(system);
}

function productOfColumns(
  rows: readonly number[][],
  term: number,
  other: (row: readonly number[], sample: number) => number,
): number {
  return rows.reduce((sum, row, sample) => sum + (row[term] ?? 0) * other(row, sample), 0);
}

function solved(augmented: number[][]): number[] {
  for (const pivot of augmented.keys()) eliminateAround(augmented, pivot);
  return augmented.map((row, term) => (row.at(-1) ?? 0) / (row[term] ?? 1));
}

function eliminateAround(augmented: number[][], pivot: number): void {
  const pivotRow = augmented[pivot] ?? [];
  for (const [term, row] of augmented.entries()) {
    if (term !== pivot) subtractScaled(row, pivotRow, (row[pivot] ?? 0) / (pivotRow[pivot] ?? 1));
  }
}

function subtractScaled(row: number[], pivotRow: readonly number[], factor: number): void {
  for (const [column, value] of pivotRow.entries())
    row[column] = (row[column] ?? 0) - factor * value;
}
