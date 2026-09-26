import { FramePairer } from './FramePairer';
import type { FramePairQueue } from './FramePairQueue';
import { StartGate } from './StartGate';
import type { EncodedVideoPacket, VideoTrackReader } from '../../ports/Demuxer';
import type { VideoDecoderHandle, VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import { Signal } from '../../shared/async/Signal';
import { ensureInvariant, GyroViewError } from '../../shared/errors/GyroViewError';
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

type PacketIterator = AsyncIterator<EncodedVideoPacket>;

/**
 * Everything one run owns, built when the run opens and torn down when it ends.
 */
interface Run<Handle> {
  readonly output: FramePairQueue<Handle>;
  readonly abort: Signal;
  /**
   * Settled by the first decoder that reports an error; the run is aborted and rejects with it.
   */
  readonly failure: Deferred<Error>;
  readonly tally: RunTally;
  readonly gate: StartGate<Handle>;
  readonly pairer: FramePairer<Handle>;
  readonly iterators: readonly PacketIterator[];
  readonly decoders: readonly VideoDecoderHandle[];
}

const ABORTED = Symbol('aborted');

/**
 * Decodes the lens tracks of a recording in lockstep from a chosen time: starts every decoder at
 * the key packet before that time, feeds packets round-robin with bounded decoder queues, pairs
 * the resulting frames and hands pairs to the output queue through a {@link StartGate}. One
 * instance runs once; the session creates a new one per run.
 */
export class LensDecodePipeline<Handle = unknown> {
  private readonly abortSignal = new Signal();
  private hasRun = false;

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
   * Runs until the tracks end, the output queue is closed or {@link abort} is called. Resolves
   * with a report; rejects when a decoder fails or a track cannot be read.
   */
  public async run(from: Seconds, output: FramePairQueue<Handle>): Promise<DecodeRunReport> {
    ensureInvariant(!this.hasRun, 'a decode pipeline runs once; create a new one for each run');
    this.hasRun = true;
    const run = await this.openRun(from, output);
    try {
      const hasReachedEnd = await this.feed(run);
      await settle(run, hasReachedEnd);
      if (run.failure.isSettled) throw await run.failure.promise;
      return reportOf(run, hasReachedEnd);
    } finally {
      closeRun(run);
    }
  }

  /**
   * Ends the run early; pending decodes are discarded. Safe before, during and after the run.
   */
  public abort(): void {
    this.abortSignal.trigger();
  }

  private async openRun(from: Seconds, output: FramePairQueue<Handle>): Promise<Run<Handle>> {
    const abort = this.abortSignal;
    const failure = new Deferred<Error>();
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
    const iterators = await this.packetIteratorsFrom(from);
    const onError = (error: Error): void => {
      failure.resolve(error);
      abort.trigger();
    };
    try {
      const decoders = await this.createDecoders(pairer, onError);
      return { output, abort, failure, tally, gate, pairer, iterators, decoders };
    } catch (error) {
      closeIterators(iterators);
      throw error;
    }
  }

  /**
   * Opens one decoder per lens; if any refuses, the ones already open are closed again.
   */
  private async createDecoders(
    pairer: FramePairer<Handle>,
    onError: (error: Error) => void,
  ): Promise<VideoDecoderHandle[]> {
    const results = await Promise.allSettled(
      this.lensTracks.map(async (track, lensIndex) =>
        this.decoderPort.create(await track.decoderConfiguration(), {
          onFrame: (frame) => {
            pairer.push(lensIndex, frame);
          },
          onError,
        }),
      ),
    );
    const opened = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const refusal = results.find((result) => result.status === 'rejected');
    if (refusal) {
      for (const decoder of opened) decoder.close();
      throw toError(refusal.reason);
    }
    return opened;
  }

  /**
   * Resolves to true when every track ran out of packets, false when aborted or the queue closed.
   */
  private async feed(run: Run<Handle>): Promise<boolean> {
    while (!shouldStop(run)) {
      await Promise.race([run.output.waitForRoom(), run.abort.promise]);
      if (shouldStop(run)) return false;
      const round = await Promise.race([nextRound(run.iterators), afterAbort(run.abort)]);
      if (round === ABORTED) return false;
      if (!round) return true;
      await this.decodeRound(run, round);
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
        run.abort.promise,
      ]);
      if (shouldStop(run)) return;
      decoder.decode(packet);
      run.tally.packets += 1;
    }
  }

  private packetIteratorsFrom(from: Seconds): Promise<PacketIterator[]> {
    return Promise.all(
      this.lensTracks.map(async (track) => {
        const start = (await track.keyPacketAt(from)) ?? (await track.keyPacketAt(seconds(0)));
        if (!start) {
          throw new GyroViewError(
            'no-key-frame',
            `track ${track.description.trackIndex} has no key frame`,
          );
        }
        return track.packetsFrom(start)[Symbol.asyncIterator]();
      }),
    );
  }
}

function shouldStop<Handle>(run: Run<Handle>): boolean {
  return run.abort.wasTriggered || run.output.isClosedForGood;
}

async function afterAbort(abort: Signal): Promise<typeof ABORTED> {
  await abort.promise;
  return ABORTED;
}

/**
 * After the feed: an aborted run throws away what is still pending; a finished run drains the
 * decoders and, having reached the end, releases the pair the gate held back. A decoder that
 * fails while draining has already aborted the run and settled its failure.
 */
async function settle<Handle>(run: Run<Handle>, hasReachedEnd: boolean): Promise<void> {
  if (run.abort.wasTriggered) {
    for (const decoder of run.decoders) decoder.reset();
    return;
  }
  try {
    await Promise.all(run.decoders.map((decoder) => decoder.flush()));
  } catch (error) {
    if (!run.failure.isSettled) throw error;
    return;
  }
  if (hasReachedEnd) run.gate.release();
}

function closeRun<Handle>(run: Run<Handle>): void {
  for (const decoder of run.decoders) decoder.close();
  run.pairer.discardAll();
  run.gate.discard();
  closeIterators(run.iterators);
}

function closeIterators(iterators: readonly PacketIterator[]): void {
  for (const iterator of iterators) void iterator.return?.();
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

function toError(reason: unknown): Error {
  return reason instanceof Error
    ? reason
    : new GyroViewError('decode', 'a decoder could not be created', { cause: reason });
}

/**
 * One packet per lens, or undefined as soon as any lens track is exhausted.
 */
async function nextRound(
  iterators: readonly PacketIterator[],
): Promise<EncodedVideoPacket[] | undefined> {
  const results = await Promise.all(iterators.map((iterator) => iterator.next()));
  const packets: EncodedVideoPacket[] = [];
  for (const result of results) {
    if (result.done === true) return undefined;
    packets.push(result.value);
  }
  return packets;
}
