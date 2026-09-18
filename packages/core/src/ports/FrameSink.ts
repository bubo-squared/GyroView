import type { FramePair } from '../application/playback/FramePair';
import type { Seconds } from '../shared/units/time';

/**
 * What the sink is told with every presented pair, beyond the pictures themselves.
 */
export interface Presentation<Handle = unknown> {
  readonly pair: FramePair<Handle>;
  readonly frameIndex: number | undefined;
  readonly mediaTime: Seconds;
}

/**
 * Port: displays frame pairs. The implementation uploads the frames; the session keeps
 * ownership of the pair and closes it once a newer pair has been presented.
 */
export interface FrameSink<Handle = unknown> {
  present(presentation: Presentation<Handle>): void;
}
