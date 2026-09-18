import type { RecordLocation } from './RecordLocation';
import type { TrailerFooter } from './TrailerFooter';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * The parsed table of contents of an Insta360 trailer: which records exist and where.
 * Payloads are read on demand because some (gyro, thumbnails) are megabytes large.
 */
export class Trailer {
  private readonly byId: ReadonlyMap<number, RecordLocation>;

  public constructor(
    public readonly footer: TrailerFooter,
    public readonly payloadStart: number,
    records: readonly RecordLocation[],
  ) {
    this.byId = new Map(records.map((record) => [record.id, record]));
  }

  public get recordIds(): readonly number[] {
    return [...this.byId.keys()];
  }

  public has(id: number): boolean {
    return this.byId.has(id);
  }

  public locationOf(id: number): RecordLocation | undefined {
    return this.byId.get(id);
  }

  public async readRecord(source: RandomAccessSource, id: number): Promise<Uint8Array> {
    const location = this.byId.get(id);
    if (!location) {
      throw new GyroViewError('record-not-found', `trailer has no record with id ${id}`);
    }
    return source.read(location.payload);
  }
}
