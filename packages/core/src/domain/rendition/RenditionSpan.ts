import { GyroViewError } from '../../shared/errors/GyroViewError';
import {
  microseconds,
  seconds,
  secondsToMicroseconds,
  type Microseconds,
  type Seconds,
} from '../../shared/units/time';
import { EQUIRECTANGULAR_ASPECT } from '../view/panoramaView';
import type { ViewportSize } from '../view/screenLayout';

/**
 * 4:2:0 video halves the colour planes both ways, so encoders take even sizes only.
 */
const CHROMA_SUBSAMPLING = 2;

/**
 * The part of a recording a page asks to have rendered, in the recording's seconds: from its
 * start, or the start of the recording, to its end, or the end of the recording.
 */
export interface SpanRequest {
  readonly from?: Seconds;
  readonly to?: Seconds;
}

/**
 * The part of a recording a rendition draws, frame by frame: every frame from `from` up to, not
 * including, `to`, timed from `from`. The decode pipeline also delivers the frame that shows at
 * `from` when `from` falls between two frames (its start gate); the span leaves that frame out,
 * so a rendition starts with the first frame at or after `from`.
 */
export class RenditionSpan {
  private constructor(
    public readonly from: Seconds,
    public readonly to: Seconds,
  ) {}

  /**
   * The span asked for within a recording of `duration`. An end past the recording's ends with
   * it; a span that would hold no frame is refused as `invalid-argument`.
   */
  public static of(request: SpanRequest, duration: Seconds): RenditionSpan {
    const from = request.from ?? seconds(0);
    const to = seconds(Math.min(request.to ?? duration, duration));
    if (!(from >= 0 && from < duration && from < to)) {
      throw new GyroViewError(
        'invalid-argument',
        `a rendition from ${from} s to ${to} s holds no frame of a ${duration} s recording`,
      );
    }
    return new RenditionSpan(from, to);
  }

  public get duration(): Seconds {
    return seconds(this.to - this.from);
  }

  /**
   * Whether the frame presented at `timestamp` belongs to the span, `tolerance` being how far the
   * frames of one pair may lie apart.
   */
  public includes(timestamp: Seconds, tolerance: Seconds): boolean {
    return timestamp >= this.from - tolerance && !this.hasEndedAt(timestamp, tolerance);
  }

  /**
   * Whether the frame presented at `timestamp`, and every later one, lies past the span's end.
   */
  public hasEndedAt(timestamp: Seconds, tolerance: Seconds): boolean {
    return timestamp >= this.to - tolerance;
  }

  /**
   * The timestamp of the frame presented at `timestamp`, in whole microseconds from the span's
   * start, as a `VideoFrame` takes it; a frame within the tolerance before the start is at zero.
   */
  public timestampOf(timestamp: Seconds): Microseconds {
    const since = Math.round(secondsToMicroseconds(seconds(timestamp - this.from)));
    return microseconds(Math.max(0, since));
  }
}

/**
 * The size of the equirectangular picture a rendition draws `width` pixels across: half as tall,
 * so the panorama fills it without bars. Both sides must be even, as encoders of 4:2:0 video take
 * them, so a width that is not a multiple of four is refused as `invalid-argument`.
 */
export function renditionSizeOf(width: number): ViewportSize {
  const height = width / EQUIRECTANGULAR_ASPECT;
  if (!(Number.isSafeInteger(height) && height > 0 && height % CHROMA_SUBSAMPLING === 0)) {
    throw new GyroViewError('invalid-argument', `a rendition cannot be ${width} pixels across`);
  }
  return { width, height };
}
