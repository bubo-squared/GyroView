import type { FramePair } from './FramePair';
import { FramePairer } from './FramePairer';
import type { FramePairQueue } from './FramePairQueue';
import type { EncodedVideoPacket, VideoTrackReader } from '../../ports/Demuxer';
import type { VideoDecoderHandle, VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { Signal } from '../../shared/async/Signal';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../../shared/units/time';

export interface DecodePipelineOptions {
  /**
   * Packets each decoder may hold before the pipeline pauses feeding it.
   */
  readonly maxPendingPackets: number;
  /**
   * How far apart two lenses' timestamps may be and still count as one instant.
   */
  readonly pairTolerance: Seconds;
}

export interface DecodeRunReport {
  readonly packetsDecoded: number;
  readonly pairsDelivered: number;
  readonly unpairedFrames: number;
  readonly framesDroppedBeforeStart: number;
  readonly hasReachedEnd: boolean;
}

/**
 * Counters of one run, kept apart from the control flow.
 */
class RunTally {
  public packets = 0;
  public pairs = 0;
  public droppedBeforeStart = 0;

  public report(unpairedFrames: number, hasReachedEnd: boolean): DecodeRunReport {
    return {
      packetsDecoded: this.packets,
      pairsDelivered: this.pairs,
      unpairedFrames,
      framesDroppedBeforeStart: this.droppedBeforeStart,
      hasReachedEnd,
    };
  }
}

interface DeliverySink<Handle> {
  readonly from: Seconds;
  readonly output: FramePairQueue<Handle>;
  readonly tally: RunTally;
}

interface RunContext<Handle> extends DeliverySink<Handle> {
  readonly decoders: readonly VideoDecoderHandle[];
  readonly stop: Signal;
}

/**
 * Decodes the lens tracks of a recording in lockstep from a chosen time: starts every decoder at
 * the key packet before that time, feeds packets round-robin with bounded decoder queues, pairs
 * the resulting frames and hands pairs to the output queue. Frames before the requested start
 * (decoded only because a GOP begins with a key frame) are dropped.
 */
export class LensDecodePipeline<Handle = unknown> {
  private stopSignal = new Signal();

  public constructor(
    private readonly lensTracks: readonly VideoTrackReader[],
    private readonly decoderPort: VideoDecoderPort<Handle>,
    private readonly options: DecodePipelineOptions,
  ) {
    if (lensTracks.length === 0) {
      throw new GyroViewError(
        'invariant-violation',
        'a decode pipeline needs at least one lens track',
      );
    }
  }

  /**
   * Runs until the tracks end, the output queue is closed or {@link stop} is called. Resolves
   * with a report; rejects on decoder failure.
   */
  public async run(from: Seconds, output: FramePairQueue<Handle>): Promise<DecodeRunReport> {
    const stop = new Signal();
    this.stopSignal = stop;
    const sink: DeliverySink<Handle> = { from, output, tally: new RunTally() };
    const pairer = new FramePairer<Handle>(
      this.lensTracks.length,
      this.options.pairTolerance,
      (pair) => {
        this.deliver(pair, sink);
      },
    );
    const decoders = await this.createDecoders(pairer);
    try {
      const hasReachedEnd = await this.feed({ ...sink, decoders, stop });
      await settle(decoders, stop);
      return sink.tally.report(pairer.unpaired, hasReachedEnd);
    } finally {
      for (const decoder of decoders) decoder.close();
      pairer.discardAll();
    }
  }

  public stop(): void {
    this.stopSignal.trigger();
  }

  private deliver(pair: FramePair<Handle>, sink: DeliverySink<Handle>): void {
    if (pair.timestamp < sink.from) {
      sink.tally.droppedBeforeStart += 1;
      for (const frame of pair.frames) frame.close();
      return;
    }
    sink.tally.pairs += 1;
    sink.output.push(pair);
  }

  private async createDecoders(pairer: FramePairer<Handle>): Promise<VideoDecoderHandle[]> {
    let failure: Error | undefined;
    const decoders = await Promise.all(
      this.lensTracks.map(async (track, lensIndex) =>
        this.decoderPort.create(await track.decoderConfiguration(), {
          onFrame: (frame) => {
            pairer.push(lensIndex, frame);
          },
          onError: (error) => {
            failure ??= error;
          },
        }),
      ),
    );
    if (failure) throw failure;
    return decoders;
  }

  /**
   * Resolves to true when every track ran out of packets, false when stopped or the queue closed.
   */
  private async feed(context: RunContext<Handle>): Promise<boolean> {
    const iterators = await this.packetIteratorsFrom(context.from);
    while (!shouldStop(context)) {
      await Promise.race([context.output.waitForRoom(), context.stop.promise]);
      if (shouldStop(context)) return false;
      const packets = await nextRound(iterators);
      if (!packets) return true;
      await this.decodeRound(context, packets);
    }
    return false;
  }

  private async decodeRound(
    context: RunContext<Handle>,
    packets: readonly EncodedVideoPacket[],
  ): Promise<void> {
    for (const [lensIndex, decoder] of context.decoders.entries()) {
      const packet = packets[lensIndex];
      if (!packet) continue;
      await Promise.race([
        decoder.waitForPendingBelow(this.options.maxPendingPackets),
        context.stop.promise,
      ]);
      if (shouldStop(context)) return;
      decoder.decode(packet);
      context.tally.packets += 1;
    }
  }

  private packetIteratorsFrom(from: Seconds): Promise<AsyncIterator<EncodedVideoPacket>[]> {
    return Promise.all(
      this.lensTracks.map(async (track) => {
        const start = (await track.keyPacketAt(from)) ?? (await track.keyPacketAt(seconds(0)));
        if (!start) {
          throw new GyroViewError(
            'no-frame-times',
            `track ${track.description.trackIndex} has no key frame`,
          );
        }
        return track.packetsFrom(start)[Symbol.asyncIterator]();
      }),
    );
  }
}

function shouldStop<Handle>(context: RunContext<Handle>): boolean {
  return context.stop.wasTriggered || context.output.isClosedForGood;
}

/**
 * After the feed: a stopped run throws away what is still pending; a finished run drains it.
 */
async function settle(decoders: readonly VideoDecoderHandle[], stop: Signal): Promise<void> {
  if (stop.wasTriggered) {
    for (const decoder of decoders) decoder.reset();
    return;
  }
  await Promise.all(decoders.map((decoder) => decoder.flush()));
}

/**
 * One packet per lens, or undefined as soon as any lens track is exhausted.
 */
async function nextRound(
  iterators: readonly AsyncIterator<EncodedVideoPacket>[],
): Promise<EncodedVideoPacket[] | undefined> {
  const results = await Promise.all(iterators.map((iterator) => iterator.next()));
  const packets: EncodedVideoPacket[] = [];
  for (const result of results) {
    if (result.done === true) return undefined;
    packets.push(result.value);
  }
  return packets;
}
