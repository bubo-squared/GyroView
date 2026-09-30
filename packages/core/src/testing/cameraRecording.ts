import { EVERY_SAMPLE_IS_A_KEYFRAME } from '../domain/container/KeyframeRule';
import { SampleTable } from '../domain/container/SampleTable';
import { TrackSampleTable, type TrackKind } from '../domain/container/TrackSampleTable';
import { seconds, type Seconds } from '../shared/units/time';

/**
 * The shape of a synthetic recording laid out as the cameras write theirs: per frame, the first
 * lens's frame, a sound sample, then the second lens's frame, one after another.
 */
export interface CameraLayout {
  readonly frames: number;
  readonly frameBytes: number;
  readonly soundBytes: number;
  readonly frameRate: number;
  readonly framesPerGop: number;
}

export interface CameraRecording {
  readonly table: SampleTable;
  readonly lens0: TrackSampleTable;
  readonly sound: TrackSampleTable;
  readonly lens1: TrackSampleTable;
  readonly fileSize: number;
  /**
   * The bytes of one frame of both lenses and the sound between them.
   */
  readonly slotBytes: number;
  readonly duration: Seconds;
}

const LENS_0_TRACK_ID = 1;
const SOUND_TRACK_ID = 2;
const LENS_1_TRACK_ID = 3;
const LENSES = 2;

interface TrackPlacement {
  readonly trackId: number;
  readonly kind: TrackKind;
  readonly offsetInSlot: number;
  readonly size: number;
}

/**
 * The sample tables of such a recording; its bytes are whatever a test serves at those offsets.
 */
export function cameraRecording(layout: CameraLayout): CameraRecording {
  const slotBytes = LENSES * layout.frameBytes + layout.soundBytes;
  const [lens0, sound, lens1] = placementsOf(layout).map((placement) =>
    trackOf(layout, slotBytes, placement),
  );
  if (!lens0 || !sound || !lens1) throw new Error('a camera recording has three tracks');
  return {
    table: new SampleTable([lens0, sound, lens1]),
    lens0,
    sound,
    lens1,
    fileSize: layout.frames * slotBytes,
    slotBytes,
    duration: seconds(layout.frames / layout.frameRate),
  };
}

function placementsOf(layout: CameraLayout): TrackPlacement[] {
  const { frameBytes, soundBytes } = layout;
  return [
    { trackId: LENS_0_TRACK_ID, kind: 'video', offsetInSlot: 0, size: frameBytes },
    { trackId: SOUND_TRACK_ID, kind: 'audio', offsetInSlot: frameBytes, size: soundBytes },
    {
      trackId: LENS_1_TRACK_ID,
      kind: 'video',
      offsetInSlot: frameBytes + soundBytes,
      size: frameBytes,
    },
  ];
}

function trackOf(
  layout: CameraLayout,
  slotBytes: number,
  placement: TrackPlacement,
): TrackSampleTable {
  const column = (value: (frame: number) => number): Float64Array =>
    Float64Array.from({ length: layout.frames }, (_, frame) => value(frame));
  const isVideo = placement.kind === 'video';
  return new TrackSampleTable({
    trackId: placement.trackId,
    kind: placement.kind,
    offsets: column((frame) => frame * slotBytes + placement.offsetInSlot),
    sizes: column(() => placement.size),
    timestamps: column((frame) => frame / layout.frameRate),
    durations: column(() => 1 / layout.frameRate),
    syncSamples: isVideo ? syncSamplesOf(layout) : undefined,
    end: seconds(layout.frames / layout.frameRate),
    keyframeRule: EVERY_SAMPLE_IS_A_KEYFRAME,
  });
}

function syncSamplesOf(layout: CameraLayout): number[] {
  const count = Math.ceil(layout.frames / layout.framesPerGop);
  return Array.from({ length: count }, (_, gop) => gop * layout.framesPerGop);
}
