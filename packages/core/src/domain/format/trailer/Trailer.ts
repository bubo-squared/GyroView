import type { RecordLocation } from './RecordLocation';
import type { TrailerFooter } from './TrailerFooter';

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

  public get records(): readonly RecordLocation[] {
    return [...this.byId.values()];
  }

  public locationOf(id: number): RecordLocation | undefined {
    return this.byId.get(id);
  }
}
