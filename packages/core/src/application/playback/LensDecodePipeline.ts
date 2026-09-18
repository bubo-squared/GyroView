import { FramePairer } from './FramePairer';
import type { FramePairQueue } from './FramePairQueue';
import { StartGate } from './StartGate';
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
  /**
   * Pairs decoded before the requested start and thrown away. The last pair before the start
   * is not among them: it is delivered, being the frame on screen at the start.
   */
  readonly pairsDroppedBeforeStart: number;
  readonly hasReachedEnd: boolean;
}

interface RunTally {
  packets: number;
  pairs: number;
}

/**
 * Everything one run owns, built when the run opens and torn down when it ends.
 */
interface Run<Handle> {
  readonly from: Seconds;
  readonly output: FramePairQueue<Handle>;
  readonly stop: Signal;
  readonly tally: RunTally;
  readonly gate: StartGate<Handle>;
  readonly pairer: FramePairer<Handle>;
  readonly decoders: readonly VideoDecoderHandle[];
}

/**
 * Decodes the lens tracks of a recording in lockstep from a chosen time: starts every decoder at
 * the key packet before that time, feeds packets round-robin with bounded decoder queues, pairs
 * the resulting frames and hands pairs to the output queue through a {@link StartGate}.
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
    const run = await this.openRun(from, output);
    try {
      const hasReachedEnd = await this.feed(run);
      await settle(run, hasReachedEnd);
      return reportOf(run, hasReachedEnd);
    } finally {
      closeRun(run);
    }
  }

  public stop(): void {
    this.stopSignal.trigger();
  }

  private async openRun(from: Seconds, output: FramePairQueue<Handle>): Promise<Run<Handle>> {
    const stop = new Signal();
    this.stopSignal = stop;
    const tally: RunTally = { packets: 0, pairs: 0 };
    const gate = new StartGate<Handle>(from, (pair) => {
      tally.pairs += 1;
      output.push(pair);
    });
    const pairer = new FramePairer<Handle>(
      this.lensTracks.length,
      this.options.pairTolerance,
      (pair) => {
        gate.push(pair);
      },
    );
    const decoders = await this.createDecoders(pairer);
    return { from, output, stop, tally, gate, pairer, decoders };
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
  private async feed(run: Run<Handle>): Promise<boolean> {
    const iterators = await this.packetIteratorsFrom(run.from);
    while (!shouldStop(run)) {
      await Promise.race([run.output.waitForRoom(), run.stop.promise]);
      if (shouldStop(run)) return false;
      const packets = await nextRound(iterators);
      if (!packets) return true;
      await this.decodeRound(run, packets);
    }
    return false;
  }

  private async decodeRound(
    run: Run<Handle>,
    packets: readonly EncodedVideoPacket[],
  ): Promise<void> {
    for (const [lensIndex, decoder] of run.decoders.entries()) {
      const packet = packets[lensIndex];
      if (!packet) continue;
      await Promise.race([
        decoder.waitForPendingBelow(this.options.maxPendingPackets),
        run.stop.promise,
      ]);
      if (shouldStop(run)) return;
      decoder.decode(packet);
      run.tally.packets += 1;
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

function shouldStop<Handle>(run: Run<Handle>): boolean {
  return run.stop.wasTriggered || run.output.isClosedForGood;
}

/**
 * After the feed: a stopped run throws away what is still pending; a finished run drains the
 * decoders and, having reached the end, releases the pair the gate held back.
 */
async function settle<Handle>(run: Run<Handle>, hasReachedEnd: boolean): Promise<void> {
  if (run.stop.wasTriggered) {
    for (const decoder of run.decoders) decoder.reset();
    return;
  }
  await Promise.all(run.decoders.map((decoder) => decoder.flush()));
  if (hasReachedEnd) run.gate.release();
}

function closeRun<Handle>(run: Run<Handle>): void {
  for (const decoder of run.decoders) decoder.close();
  run.pairer.discardAll();
  run.gate.discard();
}

function reportOf<Handle>(run: Run<Handle>, hasReachedEnd: boolean): DecodeRunReport {
  return {
    packetsDecoded: run.tally.packets,
    pairsDelivered: run.tally.pairs,
    unpairedFrames: run.pairer.unpaired,
    pairsDroppedBeforeStart: run.gate.dropped,
    hasReachedEnd,
  };
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
