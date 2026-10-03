import { quartilesOf, type Quartiles } from './statistics';

/**
 * One animation frame of a playing recording, as the pipeline recorder saw it: when it ran and
 * the clock it read, the lens frames it uploaded and the mipmaps it built, and when the GPU had
 * done its commands, all in milliseconds of the page's clock.
 */
export interface TickRecord {
  readonly frameTime: number;
  readonly start: number;
  end: number;
  readonly clock: number;
  readonly uploads: UploadRecord[];
  mipmapMs: number;
  gpuDoneAt: number | undefined;
}

/**
 * A lens frame uploaded into its texture: the frame's timestamp, in microseconds as WebCodecs
 * gives it, and how long the upload call took.
 */
export interface UploadRecord {
  readonly timestamp: number;
  readonly ms: number;
}

/**
 * A lens frame as it left its decoder.
 */
export interface DecodedRecord {
  readonly at: number;
  readonly timestamp: number;
}

export interface PipelineRecord {
  readonly ticks: readonly TickRecord[];
  readonly decoded: readonly DecodedRecord[];
  readonly frameRate: number;
}

/**
 * Where a playing recording's frames went, over the animation frames that drew a new pair.
 */
export interface PacingSummary {
  readonly frameRate: number;
  readonly pairsPerSecond: number;
  /**
   * The recording's pairs never drawn between the first and the last drawn: whatever the
   * display's rate, each pair of a recording played in time should reach the screen once.
   */
  readonly skippedPairs: number;
  /**
   * The tick's own time on the main thread.
   */
  readonly tickMs: Quartiles;
  readonly uploadMs: Quartiles;
  readonly mipmapMs: Quartiles;
  /**
   * From the tick's end until the GPU had done its commands, to the fence's polling interval.
   */
  readonly gpuMs: Quartiles;
  /**
   * How long a pair waited between its last lens leaving the decoder and its upload.
   */
  readonly decodeLeadMs: Quartiles;
}

const MILLISECONDS_PER_SECOND = 1000;
const MICROSECONDS_PER_SECOND = 1_000_000;

export function pacingSummaryOf(record: PipelineRecord): PacingSummary {
  const drawing = record.ticks.filter((tick) => tick.uploads.length > 0);
  const finished = drawing.filter((tick) => tick.gpuDoneAt !== undefined);
  return {
    frameRate: record.frameRate,
    pairsPerSecond: pairsPerSecondOf(drawing),
    skippedPairs: skippedPairsOf(drawing, MICROSECONDS_PER_SECOND / record.frameRate),
    tickMs: quartilesOf(drawing.map((tick) => tick.end - tick.start)),
    uploadMs: quartilesOf(drawing.map((tick) => totalOf(tick.uploads.map((upload) => upload.ms)))),
    mipmapMs: quartilesOf(drawing.map((tick) => tick.mipmapMs)),
    gpuMs: quartilesOf(finished.map((tick) => (tick.gpuDoneAt ?? tick.end) - tick.end)),
    decodeLeadMs: quartilesOf(decodeLeadsOf(drawing, record.decoded)),
  };
}

function pairsPerSecondOf(drawing: readonly TickRecord[]): number {
  const [first] = drawing;
  const last = drawing.at(-1);
  const spanMs = first && last ? last.start - first.start : 0;
  return spanMs > 0 ? (drawing.length - 1) / (spanMs / MILLISECONDS_PER_SECOND) : 0;
}

/**
 * Consecutive drawn pairs whose timestamps step by more than one frame skipped the pairs
 * between them; a step back, a seek or a loop, skips none.
 */
function skippedPairsOf(drawing: readonly TickRecord[], frameMicroseconds: number): number {
  let skipped = 0;
  for (const [index, tick] of drawing.entries()) {
    const previous = drawing[index - 1];
    if (!previous) continue;
    const step = timestampOf(tick) - timestampOf(previous);
    skipped += Math.max(0, Math.round(step / frameMicroseconds) - 1);
  }
  return skipped;
}

function timestampOf(tick: TickRecord): number {
  return tick.uploads[0]?.timestamp ?? NaN;
}

function totalOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Both lenses' frames of a pair share a timestamp; the later to leave its decoder completes it.
 */
function decodeLeadsOf(
  drawing: readonly TickRecord[],
  decoded: readonly DecodedRecord[],
): number[] {
  const completedAt = new Map<number, number>();
  for (const frame of decoded) {
    completedAt.set(frame.timestamp, Math.max(completedAt.get(frame.timestamp) ?? 0, frame.at));
  }
  return drawing.flatMap((tick) => {
    const at = completedAt.get(timestampOf(tick));
    return at === undefined ? [] : [tick.start - at];
  });
}
