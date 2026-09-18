// Decodes N video tracks with one WebCodecs decoder each, pairing output frames by timestamp.
import { EncodedPacketSink, type EncodedPacket, type InputVideoTrack } from 'mediabunny';

const MAX_QUEUE_DEPTH = 8;
const PAIR_TOLERANCE_MICROSECONDS = 1000;

export interface FramePair {
  frames: VideoFrame[];
  timestamp: number;
}

export interface LockstepMetrics {
  packetsDecoded: number;
  framePairs: number;
  unpairedFrames: number;
  wallSeconds: number;
  pairsPerSecond: number;
  firstPairLatencyMs: number;
  maxQueueDepth: number;
}

export interface LockstepOptions {
  startTimestamp: number;
  seconds: number;
  onPair: (pair: FramePair) => void;
}

/** Buffers decoded frames per track and emits them as soon as every track has a frame for the same instant. */
class FramePairer {
  private readonly queues: VideoFrame[][];
  public unpaired = 0;
  public pairs = 0;

  constructor(
    trackCount: number,
    private readonly onPair: (pair: FramePair) => void,
  ) {
    this.queues = Array.from({ length: trackCount }, () => []);
  }

  push(trackIndex: number, frame: VideoFrame): void {
    this.queues[trackIndex]?.push(frame);
    this.drain();
  }

  closeAll(): void {
    for (const queue of this.queues) {
      for (const frame of queue) frame.close();
      queue.length = 0;
    }
  }

  private drain(): void {
    while (this.queues.every((queue) => queue.length > 0)) {
      const heads = this.queues.map((queue) => queue[0]!);
      const earliest = Math.min(...heads.map((frame) => frame.timestamp));
      const aligned = heads.every((frame) => Math.abs(frame.timestamp - earliest) <= PAIR_TOLERANCE_MICROSECONDS);
      if (aligned) {
        this.emitPair(heads, earliest);
      } else {
        this.dropHeadAt(earliest);
      }
    }
  }

  private emitPair(frames: VideoFrame[], timestamp: number): void {
    for (const queue of this.queues) queue.shift();
    this.pairs += 1;
    this.onPair({ frames, timestamp });
  }

  private dropHeadAt(timestamp: number): void {
    const index = this.queues.findIndex((queue) => queue[0]?.timestamp === timestamp);
    this.queues[index]?.shift()?.close();
    this.unpaired += 1;
  }
}

async function waitForQueueRoom(decoder: VideoDecoder): Promise<void> {
  while (decoder.decodeQueueSize > MAX_QUEUE_DEPTH) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

export async function createHardwareDecoder(track: InputVideoTrack, output: (frame: VideoFrame) => void): Promise<VideoDecoder> {
  const config = await track.getDecoderConfig();
  if (!config) throw new Error(`track ${track.id} has no decoder config`);
  const decoder = new VideoDecoder({ output, error: (error) => console.error('decoder error', error) });
  decoder.configure({ ...config, hardwareAcceleration: 'prefer-hardware' });
  return decoder;
}

export async function* packetsBetween(track: InputVideoTrack, startTimestamp: number, endTimestamp: number): AsyncGenerator<EncodedPacket> {
  const sink = new EncodedPacketSink(track);
  const start = await sink.getKeyPacket(startTimestamp);
  if (!start) return;
  for await (const packet of sink.packets(start)) {
    if (packet.timestamp >= endTimestamp) return;
    yield packet;
  }
}

export async function decodeInLockstep(tracks: InputVideoTrack[], options: LockstepOptions): Promise<LockstepMetrics> {
  const startedAt = performance.now();
  let firstPairLatencyMs = -1;
  const pairer = new FramePairer(tracks.length, (pair) => {
    if (firstPairLatencyMs < 0) firstPairLatencyMs = performance.now() - startedAt;
    options.onPair(pair);
  });
  const decoders = await Promise.all(tracks.map((track, index) => createHardwareDecoder(track, (frame) => pairer.push(index, frame))));
  const generators = tracks.map((track) => packetsBetween(track, options.startTimestamp, options.startTimestamp + options.seconds));
  let packetsDecoded = 0;
  let maxQueueDepth = 0;

  try {
    while (true) {
      const next = await Promise.all(generators.map((generator) => generator.next()));
      if (next.some((result) => result.done)) break;
      for (const [index, decoder] of decoders.entries()) {
        await waitForQueueRoom(decoder);
        decoder.decode(next[index]!.value.toEncodedVideoChunk());
        maxQueueDepth = Math.max(maxQueueDepth, decoder.decodeQueueSize);
        packetsDecoded += 1;
      }
    }
    await Promise.all(decoders.map((decoder) => decoder.flush()));
  } finally {
    for (const decoder of decoders) decoder.close();
    pairer.closeAll();
  }

  const wallSeconds = (performance.now() - startedAt) / 1000;
  return {
    packetsDecoded,
    framePairs: pairer.pairs,
    unpairedFrames: pairer.unpaired,
    wallSeconds,
    pairsPerSecond: pairer.pairs / wallSeconds,
    firstPairLatencyMs,
    maxQueueDepth,
  };
}
