import { keyframeRuleFor } from './keyframeRules';
import { boxesIn, fullBoxOf, optionalBox, unreadableMovie, type Mp4Box } from './movieBoxes';
import { HandlerType, Mp4BoxType } from './mp4BoxTypes';
import { SYNC_SAMPLE } from './mp4Layouts';
import { readTableColumns } from './readTable';
import { sampleLocationsOf } from './sampleLocations';
import { sampleTimingOf } from './sampleTiming';
import { movieTimescaleOf, trackBoxesOf, trackHandlerOf, trackHeadersOf } from './trackHeaders';
import { SampleTable } from '../../container/SampleTable';
import { TrackSampleTable, type TrackKind } from '../../container/TrackSampleTable';

/**
 * The tracks the player plays, by handler; the others (time codes, metadata) are left out.
 */
const KIND_OF_HANDLER: Readonly<Record<string, TrackKind>> = {
  [HandlerType.Video]: 'video',
  [HandlerType.Sound]: 'audio',
};

/**
 * Sample numbers in the sync sample table count from one.
 */
const FIRST_SAMPLE_NUMBER = 1;

/**
 * The sample table of a whole movie box (`moov`, header included): every sample of every track
 * of picture or sound. A fragmented movie, whose samples are described in movie fragments after
 * it, is refused: the cameras write none.
 */
export function parseMovie(movieBox: Uint8Array): SampleTable {
  const [movie] = boxesIn(movieBox);
  if (movie?.type !== Mp4BoxType.Movie) throw unreadableMovie('is not where the file says it is');
  const children = boxesIn(movie.body);
  if (optionalBox(children, Mp4BoxType.MovieExtends)) {
    throw unreadableMovie('is fragmented: its samples are described in movie fragments after it');
  }
  const movieTimescale = movieTimescaleOf(children);
  const tracks = children
    .filter((box) => box.type === Mp4BoxType.Track)
    .flatMap((box) => playedTrackOf(box, movieTimescale));
  return new SampleTable(tracks);
}

function playedTrackOf(trackBox: Mp4Box, movieTimescale: number): TrackSampleTable[] {
  const kind = KIND_OF_HANDLER[trackHandlerOf(trackBox)];
  if (!kind) return [];
  const boxes = trackBoxesOf(trackBox);
  const headers = trackHeadersOf(boxes);
  const locations = sampleLocationsOf(boxes.sampleTable);
  const timing = sampleTimingOf(boxes, {
    media: headers.mediaTimescale,
    movie: movieTimescale,
    sampleCount: locations.sizes.length,
  });
  const track = new TrackSampleTable({
    trackId: headers.trackId,
    kind,
    ...locations,
    ...timing,
    syncSamples: syncSamplesOf(boxes.sampleTable),
    keyframeRule: keyframeRuleFor(headers),
  });
  return [track];
}

/**
 * The samples decoding may start at, counted from zero; undefined for a track without a sync
 * sample table, whose every sample is one.
 */
function syncSamplesOf(sampleTable: readonly Mp4Box[]): number[] | undefined {
  const box = optionalBox(sampleTable, Mp4BoxType.SyncSample);
  if (!box) return undefined;
  const { sampleNumber } = readTableColumns(fullBoxOf(box).content, SYNC_SAMPLE);
  return sampleNumber.map((number) => number - FIRST_SAMPLE_NUMBER);
}
