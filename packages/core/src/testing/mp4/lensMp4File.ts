import { buildMp4File, type BuiltMp4File } from './buildMp4File';
import type { FixtureSample, FixtureTrack } from './FixtureTrack';
import { audioSampleEntry, videoSampleEntry } from './sampleEntries';
import { encodeBox } from '../encodeBox';

export interface LensFileSpec {
  /**
   * Square lens tracks, their ids counted from 1.
   */
  readonly lenses: number;
  /**
   * Frames a track, at 10 a second; 30 by default.
   */
  readonly frames?: number;
  /**
   * `none` lists no sync sample at all, as a track decoding cannot start in; a key frame opens
   * every ten frames by default.
   */
  readonly keyframes?: 'every-group' | 'none';
  /**
   * A sound track after the lenses, a sample a frame.
   */
  readonly hasSound?: boolean;
}

const FRAMES = 30;
const FRAMES_PER_GROUP = 10;
const TIMESCALE = 90_000;
const FRAME_DURATION = 9000;
const SAMPLE_BYTES = 16;
const LENS_SIZE = 64;
/**
 * Sample entry types of no codec: the core's key-frame rule then keeps the sample table's word,
 * so the samples need no real picture or sound.
 */
const LENS_ENTRY = 'tstv';
const SOUND_ENTRY = 'tsta';
const SOUND_RATE = 48_000;

/**
 * An MP4 file of square lens tracks of synthetic samples, 3 s at 10 frames a second by default,
 * for tests of what opens a recording and reads its tracks.
 */
export function lensMp4File(spec: LensFileSpec): BuiltMp4File {
  const frames = spec.frames ?? FRAMES;
  const hasKeyframes = spec.keyframes !== 'none';
  const lenses = Array.from({ length: spec.lenses }, (_, index) =>
    lensTrack({ trackId: index + 1, frames, hasKeyframes }),
  );
  const sound = spec.hasSound === true ? [soundTrack(spec.lenses + 1, frames)] : [];
  return buildMp4File([...lenses, ...sound]);
}

interface LensTrackSpec {
  readonly trackId: number;
  readonly frames: number;
  readonly hasKeyframes: boolean;
}

function lensTrack({ trackId, frames, hasKeyframes }: LensTrackSpec): FixtureTrack {
  const entry = { type: LENS_ENTRY, width: LENS_SIZE, height: LENS_SIZE };
  const isKeyframe = (frame: number): boolean => hasKeyframes && frame % FRAMES_PER_GROUP === 0;
  return {
    trackId,
    handler: 'vide',
    sampleEntry: videoSampleEntry({ ...entry, configuration: encodeBox('tstC', new Uint8Array()) }),
    timescale: TIMESCALE,
    samples: samplesOf({ trackId, frames, isSync: isKeyframe }),
    syncSamples: 'listed',
  };
}

function soundTrack(trackId: number, frames: number): FixtureTrack {
  const entry = { type: SOUND_ENTRY, channelCount: 2, sampleRate: SOUND_RATE };
  return {
    trackId,
    handler: 'soun',
    sampleEntry: audioSampleEntry({ ...entry, configuration: encodeBox('tstC', new Uint8Array()) }),
    timescale: TIMESCALE,
    samples: samplesOf({ trackId, frames, isSync: () => true }),
    syncSamples: 'unlisted',
  };
}

interface SamplesSpec {
  readonly trackId: number;
  readonly frames: number;
  readonly isSync: (frame: number) => boolean;
}

/**
 * A track's samples, each filled with its track id, so a sample's bytes tell whose it is.
 */
function samplesOf({ trackId, frames, isSync }: SamplesSpec): FixtureSample[] {
  return Array.from({ length: frames }, (_, frame) => ({
    bytes: new Uint8Array(SAMPLE_BYTES).fill(trackId),
    duration: FRAME_DURATION,
    isSync: isSync(frame),
  }));
}
