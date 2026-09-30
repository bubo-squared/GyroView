import type { ByteStream } from '../../ports/ByteStream';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { ByteRange } from '../../shared/binary/ByteRange';
import { Ending, ITERATION_END } from '../../shared/async/iteration';

/**
 * A ByteStream over any random-access source, a range read whole and handed on as one chunk:
 * for sources whose reads are quick (a local file, bytes in memory), where streaming a range
 * piece by piece would gain nothing.
 */
export class SourceByteStream implements ByteStream {
  public constructor(private readonly source: RandomAccessSource) {}

  public stream(range: ByteRange): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> =>
        new WholeRangeReading(this.source, range),
    };
  }
}

/**
 * One range, read on the first chunk asked for; given up, it reads nothing more and its read
 * under way comes as the end.
 */
class WholeRangeReading implements AsyncIterator<Uint8Array> {
  private readonly ending = new Ending();

  public constructor(
    private readonly source: RandomAccessSource,
    private readonly range: ByteRange,
  ) {}

  public async next(): Promise<IteratorResult<Uint8Array>> {
    await Promise.resolve();
    if (this.ending.hasEnded()) return ITERATION_END;
    const bytes = await this.source.read(this.range);
    if (this.ending.hasEnded()) return ITERATION_END;
    this.ending.end();
    return bytes.byteLength === 0 ? ITERATION_END : { done: false, value: bytes };
  }

  public return(): Promise<IteratorResult<Uint8Array>> {
    this.ending.end();
    return Promise.resolve(ITERATION_END);
  }
}
