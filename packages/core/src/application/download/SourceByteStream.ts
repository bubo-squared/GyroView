import type { ByteStream } from '../../ports/ByteStream';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import type { ByteRange } from '../../shared/binary/ByteRange';

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

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
        new WholeRangeRead(this.source, range),
    };
  }
}

/**
 * One range, read on the first chunk asked for; given up, it reads nothing more and its read
 * under way comes as the end.
 */
class WholeRangeRead implements AsyncIterator<Uint8Array> {
  private isOver = false;

  public constructor(
    private readonly source: RandomAccessSource,
    private readonly range: ByteRange,
  ) {}

  public async next(): Promise<IteratorResult<Uint8Array>> {
    await Promise.resolve();
    if (this.hasEnded()) return DONE;
    const bytes = await this.source.read(this.range);
    if (this.hasEnded()) return DONE;
    this.isOver = true;
    return bytes.byteLength === 0 ? DONE : { done: false, value: bytes };
  }

  public return(): Promise<IteratorResult<Uint8Array>> {
    this.isOver = true;
    return Promise.resolve(DONE);
  }

  /**
   * Asked afresh after every wait: the range may be given up meanwhile.
   */
  private hasEnded(): boolean {
    return this.isOver;
  }
}
