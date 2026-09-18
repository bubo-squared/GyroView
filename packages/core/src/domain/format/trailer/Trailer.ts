import type { RecordLocation } from './RecordLocation';
import type { TrailerFooter } from './TrailerFooter';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * The table of contents of an Insta360 trailer: which records exist and where their payloads
 * lie. Pure data; reading payloads is the caller's job because some are megabytes large.
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

  public get records(): readonly RecordLocation[] {
    return [...this.byId.values()];
  }

  public has(id: number): boolean {
    return this.byId.has(id);
  }

  public locationOf(id: number): RecordLocation | undefined {
    return this.byId.get(id);
  }

  public requireLocation(id: number): RecordLocation {
    const location = this.byId.get(id);
    if (!location) {
      throw new GyroViewError('record-not-found', `trailer has no record with id ${id}`);
    }
    return location;
  }
}
