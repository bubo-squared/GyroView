import { FramePairer } from './FramePairer';
import type { FramePairQueue } from './FramePairQueue';
import { StartGate } from './StartGate';
import type { VideoTrackReader } from '../../ports/VideoTrackReader';
import type { EncodedVideoPacket } from '../../ports/VideoTrack';
import type { VideoDecoderHandle, VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import { RunStop, STOPPED } from '../../shared/async/RunStop';
import { ensureInvariant, GyroViewError } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

export interface DecodePipelineOptions {
  /**
   * Packets each decoder may hold before the pipeline pauses feeding it.
   */
  readonly maxPendingPackets: number;
  /**
   * How far apart two frame sources' timestamps may be and still count as one instant.
   */
  readonly pairTolerance: Seconds;
}

/**
 * How one run went. The session acts on `hasReachedEnd`; the counts make the run observable,
 * which is how its pairing, backpressure and start gate are tested.
 */
export interface DecodePipelineReport {
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
  /**
   * Ends every wait of the run at once: remembering only the wait in progress, it keeps nothing
   * of the rounds already fed, however long the run.
   */
  readonly stop: RunStop;
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

/**
 * Decodes the frame sources of a recording in lockstep from a chosen time: starts every decoder at
 * the key packet at or before that time (the first one, for a time before it), feeds packets
 * round-robin with bounded decoder queues, pairs the resulting frames and hands pairs to the output
 * queue through a {@link StartGate}. One instance runs once; each `DecodeRun` creates its own.
 */
export class DecodePipeline<Handle = unknown> {
  private readonly stop = new RunStop();
  private hasRun = false;
  /**
   * The run's packet reads, which an abort returns at once: a read left to the run's unwinding
   * would go on reading until its awaits settle.
   */
  private iterators: readonly PacketIterator[] = [];

  public constructor(
    private readonly frameSources: readonly VideoTrackReader[],
    private readonly decoderPort: VideoDecoderPort<Handle>,
    private readonly options: DecodePipelineOptions,
  ) {
    if (frameSources.length === 0) {
      throw new GyroViewError(
        'invariant-violation',
        'a decode pipeline needs at least one frame source',
      );
    }
  }

  /**
   * Runs until the tracks end, the output queue is closed or {@link abort} is called. Resolves
   * with a report; rejects when a decoder fails or a track cannot be read.
   */
  public async run(from: Seconds, output: FramePairQueue<Handle>): Promise<DecodePipelineReport> {
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
   * Ends the run early: its packet reads are let go of at once, pending decodes discarded. Safe
   * before, during and after the run.
   */
  public abort(): void {
    this.stop.stop();
    closeIterators(this.iterators);
  }

  private async openRun(from: Seconds, output: FramePairQueue<Handle>): Promise<Run<Handle>> {
    const { stop } = this;
    const failure = new Deferred<Error>();
    const tally: RunTally = { packets: 0, pairs: 0 };
    const gate = new StartGate<Handle>(from, (pair) => {
      tally.pairs += 1;
      output.push(pair);
    });
    const pairer = new FramePairer<Handle>(
      this.frameSources.length,
      this.options.pairTolerance,
      (pair) => {
        gate.push(pair);
      },
    );
    // A run aborted before it opened, as a seek overtaken by the next one is, opens nothing.
    const iterators = stop.wasStopped ? [] : this.packetIteratorsFrom(from);
    this.iterators = iterators;
    const onError = (error: Error): void => {
      failure.resolve(error);
      stop.stop();
    };
    try {
      const decoders = stop.wasStopped ? [] : await this.createDecoders(pairer, onError);
      return { output, stop, failure, tally, gate, pairer, iterators, decoders };
    } catch (error) {
      closeIterators(iterators);
      throw error;
    }
  }

  /**
   * Opens one decoder per frame source; if any refuses, the ones already open are closed again.
   */
  private async createDecoders(
    pairer: FramePairer<Handle>,
    onError: (error: Error) => void,
  ): Promise<VideoDecoderHandle[]> {
    const results = await Promise.allSettled(
      this.frameSources.map(async (track, sourceIndex) =>
        this.decoderPort.create(await track.decoderConfiguration(), {
          onFrame: (frame) => {
            pairer.push(sourceIndex, frame);
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
      await run.stop.race(() => run.output.waitForRoom());
      if (shouldStop(run)) return false;
      const round = await run.stop.race(() => nextRound(run.iterators));
      if (round === STOPPED) return false;
      if (!round) return true;
      await this.decodeRound(run, round);
    }
    return false;
  }

  private async decodeRound(
    run: Run<Handle>,
    packets: readonly EncodedVideoPacket[],
  ): Promise<void> {
    for (const [sourceIndex, decoder] of run.decoders.entries()) {
      const packet = packets[sourceIndex];
      if (!packet) continue;
      await run.stop.race(() => decoder.waitForPendingBelow(this.options.maxPendingPackets));
      if (shouldStop(run)) return;
      decoder.decode(packet);
      run.tally.packets += 1;
    }
  }

  private packetIteratorsFrom(from: Seconds): PacketIterator[] {
    return this.frameSources.map((track) => track.packetsFrom(from)[Symbol.asyncIterator]());
  }
}

function shouldStop<Handle>(run: Run<Handle>): boolean {
  return run.stop.wasStopped || run.output.isClosedForGood;
}

/**
 * After the feed: a finished run drains the decoders and, having reached the end, releases the
 * pair the gate held back. An abort, before or while draining, leaves what is pending to the
 * decoders' closing.
 */
async function settle<Handle>(run: Run<Handle>, hasReachedEnd: boolean): Promise<void> {
  const drained = await run.stop.race(() => drain(run.decoders, run.failure));
  if (drained !== STOPPED && hasReachedEnd) run.gate.release();
}

/**
 * A decoder that fails while draining has already aborted the run and settled its failure.
 */
async function drain(
  decoders: readonly VideoDecoderHandle[],
  failure: Deferred<Error>,
): Promise<void> {
  try {
    await Promise.all(decoders.map((decoder) => decoder.flush()));
  } catch (error) {
    if (!failure.isSettled) throw error;
  }
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

function reportOf<Handle>(run: Run<Handle>, hasReachedEnd: boolean): DecodePipelineReport {
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
 * One packet per frame source, or undefined as soon as any of them is exhausted.
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
