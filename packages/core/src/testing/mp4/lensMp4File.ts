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
 * An MP4 file of square lens tracks of synthetic samples, 3 s at 10 frames a second, for tests
 * of what opens a recording and reads its tracks.
 */
export function lensMp4File(spec: LensFileSpec): BuiltMp4File {
  const lenses = Array.from({ length: spec.lenses }, (_, index) =>
    lensTrack(index + 1, spec.keyframes ?? 'every-group'),
  );
  const sound = spec.hasSound === true ? [soundTrack(spec.lenses + 1)] : [];
  return buildMp4File([...lenses, ...sound]);
}

function lensTrack(trackId: number, keyframes: LensFileSpec['keyframes']): FixtureTrack {
  const entry = { type: LENS_ENTRY, width: LENS_SIZE, height: LENS_SIZE };
  return {
    trackId,
    handler: 'vide',
    sampleEntry: videoSampleEntry({ ...entry, configuration: encodeBox('tstC', new Uint8Array()) }),
    timescale: TIMESCALE,
    samples: samplesOf(trackId, (frame) => keyframes !== 'none' && frame % FRAMES_PER_GROUP === 0),
    syncSamples: 'listed',
  };
}

function soundTrack(trackId: number): FixtureTrack {
  const entry = { type: SOUND_ENTRY, channelCount: 2, sampleRate: SOUND_RATE };
  return {
    trackId,
    handler: 'soun',
    sampleEntry: audioSampleEntry({ ...entry, configuration: encodeBox('tstC', new Uint8Array()) }),
    timescale: TIMESCALE,
    samples: samplesOf(trackId, () => true),
    syncSamples: 'unlisted',
  };
}

/**
 * A track's samples, each filled with its track id, so a sample's bytes tell whose it is.
 */
function samplesOf(trackId: number, isSync: (frame: number) => boolean): FixtureSample[] {
  return Array.from({ length: FRAMES }, (_, frame) => ({
    bytes: new Uint8Array(SAMPLE_BYTES).fill(trackId),
    duration: FRAME_DURATION,
    isSync: isSync(frame),
  }));
}
