// Measures how long a random-access seek costs: decode from the preceding keyframe up to the target.
import { EncodedPacketSink, type InputVideoTrack } from 'mediabunny';
import { createHardwareDecoder } from './lockstepDecoder';

export interface SeekMetrics {
  target: number;
  keyframeTimestamp: number;
  framesDecodedBeforeTarget: number;
  firstFrameAtOrAfterTarget: number;
  wallMs: number;
}

export async function measureSeek(track: InputVideoTrack, target: number): Promise<SeekMetrics> {
  const sink = new EncodedPacketSink(track);
  const keyPacket = await sink.getKeyPacket(target);
  if (!keyPacket) throw new Error(`no keyframe before ${target}`);
  const started = performance.now();
  let framesDecodedBeforeTarget = 0;
  let firstFrameAtOrAfterTarget = -1;
  let settle: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => (settle = resolve));
  const decoder = await createHardwareDecoder(track, (frame) => {
    const timestampSeconds = frame.timestamp / 1e6;
    if (firstFrameAtOrAfterTarget < 0 && timestampSeconds >= target) {
      firstFrameAtOrAfterTarget = timestampSeconds;
      settle();
    } else {
      framesDecodedBeforeTarget += 1;
    }
    frame.close();
  });
  try {
    for await (const packet of sink.packets(keyPacket)) {
      decoder.decode(packet.toEncodedVideoChunk());
      if (packet.timestamp >= target) break;
    }
    await Promise.race([reached, decoder.flush()]);
  } finally {
    decoder.close();
  }
  return {
    target,
    keyframeTimestamp: keyPacket.timestamp,
    framesDecodedBeforeTarget,
    firstFrameAtOrAfterTarget,
    wallMs: performance.now() - started,
  };
}
