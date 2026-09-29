import type { EncodedPacket } from 'mediabunny';

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * One iteration over mediabunny's packets, opened on the first packet asked for and handed out
 * as `toValue` makes them. Returning it returns mediabunny's own iterator, which ends a read
 * awaited meanwhile; mediabunny stops reading ahead for it at once.
 */
export class PacketCursor<Value> implements AsyncIterator<Value> {
  private packets: AsyncIterator<EncodedPacket> | undefined;
  private isOpen = true;

  public constructor(
    private readonly open: () => Promise<AsyncIterator<EncodedPacket>>,
    private readonly toValue: (packet: EncodedPacket) => Value,
  ) {}

  public async next(): Promise<IteratorResult<Value>> {
    this.packets ??= await this.open();
    if (this.wasReturned()) return this.returnPackets();
    const result = await this.packets.next();
    return result.done === true || this.wasReturned()
      ? DONE
      : { done: false, value: this.toValue(result.value) };
  }

  public async return(): Promise<IteratorResult<Value>> {
    this.isOpen = false;
    return this.returnPackets();
  }

  /**
   * Asked afresh after every wait: a return may come while a packet is awaited.
   */
  private wasReturned(): boolean {
    return !this.isOpen;
  }

  private async returnPackets(): Promise<IteratorReturnResult<undefined>> {
    await this.packets?.return?.();
    return DONE;
  }
}
