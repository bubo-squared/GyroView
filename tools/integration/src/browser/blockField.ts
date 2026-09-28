import type { GreyImage } from './referenceFrames';

/**
 * Where a block of the reference is found in the candidate: the shift of the candidate's
 * content in pixels (positive right and down), and how much lower the best match's cost is
 * than the block's typical cost, as a share of it.
 */
export interface BlockShift {
  readonly column: number;
  readonly row: number;
  readonly dx: number;
  readonly dy: number;
  readonly contrast: number;
}

const BLOCK = 48;
const MAX_SHIFT = 10;
const SAMPLE_STRIDE = 2;

function blockCost(
  reference: GreyImage,
  candidate: GreyImage,
  block: {
    readonly column: number;
    readonly row: number;
    readonly dx: number;
    readonly dy: number;
  },
): number | undefined {
  const { width, height } = reference;
  let total = 0;
  let count = 0;
  for (let y = block.row; y < block.row + BLOCK; y += SAMPLE_STRIDE) {
    const candidateRow = y + block.dy;
    if (candidateRow < 0 || candidateRow >= height) return undefined;
    for (let x = block.column; x < block.column + BLOCK; x += SAMPLE_STRIDE) {
      const candidateColumn = (((x + block.dx) % width) + width) % width;
      total += Math.abs(
        (reference.data[y * width + x] ?? 0) -
          (candidate.data[candidateRow * width + candidateColumn] ?? 0),
      );
      count += 1;
    }
  }
  return total / count;
}

interface Origin {
  readonly column: number;
  readonly row: number;
}

/**
 * Every shift tried, rows of dy then dx.
 */
function shiftsTried(): readonly (readonly [number, number])[] {
  const shifts: [number, number][] = [];
  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy += 1) {
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx += 1) shifts.push([dx, dy]);
  }
  return shifts;
}

function shiftOf(reference: GreyImage, candidate: GreyImage, origin: Origin): BlockShift {
  const { column, row } = origin;
  let best = { dx: 0, dy: 0, cost: Infinity };
  const costs: number[] = [];
  for (const [dx, dy] of shiftsTried()) {
    const cost = blockCost(reference, candidate, { column, row, dx, dy });
    if (cost === undefined) continue;
    costs.push(cost);
    if (cost < best.cost) best = { dx, dy, cost };
  }
  const median = costs.toSorted((a, b) => a - b)[Math.floor(costs.length / 2)] ?? 0;
  const contrast = median > 0 ? (median - best.cost) / median : 0;
  return { column, row, dx: best.dx, dy: best.dy, contrast };
}

/**
 * The shift of every block of the candidate against the reference.
 */
export function blockFieldOf(reference: GreyImage, candidate: GreyImage): BlockShift[] {
  const field: BlockShift[] = [];
  for (let row = 0; row + BLOCK <= reference.height; row += BLOCK) {
    for (let column = 0; column + BLOCK <= reference.width; column += BLOCK) {
      field.push(shiftOf(reference, candidate, { column, row }));
    }
  }
  return field;
}

export const BLOCK_SIZE = BLOCK;
