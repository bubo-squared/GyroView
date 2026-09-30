/**
 * A recording that lives only on this machine, as `samples/catalogue.json` describes it. The file
 * is git-ignored with the samples (ADR 0031): a recording shared privately never has its file
 * name, serial or numbers in the repository, and the tests learn what they need of it here.
 */
export interface LocalSampleEntry {
  readonly slug: string;
  readonly name: string;
  /**
   * The folder under `samples/` holding the recording.
   */
  readonly folder: string;
  readonly recording: string;
  readonly frameRate: number;
  readonly codedSize: number;
  /**
   * The moment the picture tests render, in the recording's seconds.
   */
  readonly renderMoment: number;
  /**
   * The moments the IMU frame ranking measures stillness at (ADR 0009).
   */
  readonly imuRankingTimes: readonly number[];
  readonly studio?: LocalStudioClip;
  /**
   * Words of the recording that must never enter the repository, such as its file name and
   * serial number, which the privacy check looks for.
   */
  readonly privateTokens: readonly string[];
}

/**
 * The recording's Studio export, whose frames are extracted beforehand as
 * `studio-<slug>-<time>s.png` (see `measure/support/referenceFrames.ts`).
 */
export interface LocalStudioClip {
  /**
   * The recording's time at the export's first frame.
   */
  readonly start: number;
  readonly frameTimes: readonly number[];
  /**
   * The frames the lens readings are scored on, the slowest measurement.
   */
  readonly comparedTimes: readonly number[];
  /**
   * The recording's time the seam's steadiness is measured from.
   */
  readonly steadinessStart: number;
  /**
   * For an HDR recording, the frames of Studio's SDR export of the same stitch, extracted as
   * `studio-<slug>-sdr-<time>s.png`: the reference of the player's colour (ADR 0033).
   */
  readonly sdrFrameTimes?: readonly number[];
}

/**
 * A local sample as the browser tests receive it: its entry, and the URL Vite serves the
 * recording at.
 */
export type ServedLocalSample = LocalSampleEntry & { readonly url: string };

type Fields = Readonly<Record<string, unknown>>;

/**
 * The catalogue's entries, checked field by field: the file is written by hand.
 */
export function parseLocalCatalogue(json: unknown): LocalSampleEntry[] {
  const samples = objectOf(json, 'the catalogue')['samples'];
  if (!Array.isArray(samples)) throw new TypeError('the catalogue has no list of samples');
  return samples.map((sample: unknown, index) => entryOf(objectOf(sample, `sample ${index}`)));
}

function entryOf(fields: Fields): LocalSampleEntry {
  const studio = fields['studio'];
  return {
    slug: stringOf(fields, 'slug'),
    name: stringOf(fields, 'name'),
    folder: stringOf(fields, 'folder'),
    recording: stringOf(fields, 'recording'),
    frameRate: numberOf(fields, 'frameRate'),
    codedSize: numberOf(fields, 'codedSize'),
    renderMoment: numberOf(fields, 'renderMoment'),
    imuRankingTimes: numbersOf(fields, 'imuRankingTimes'),
    ...(studio !== undefined && { studio: studioOf(objectOf(studio, 'studio')) }),
    privateTokens: stringsOf(fields, 'privateTokens'),
  };
}

function studioOf(fields: Fields): LocalStudioClip {
  return {
    start: numberOf(fields, 'start'),
    frameTimes: numbersOf(fields, 'frameTimes'),
    comparedTimes: numbersOf(fields, 'comparedTimes'),
    steadinessStart: numberOf(fields, 'steadinessStart'),
    ...(fields['sdrFrameTimes'] !== undefined && {
      sdrFrameTimes: numbersOf(fields, 'sdrFrameTimes'),
    }),
  };
}

function objectOf(value: unknown, subject: string): Fields {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${subject} is no object`);
  return value as Fields;
}

function stringOf(fields: Fields, name: string): string {
  const value = fields[name];
  if (typeof value !== 'string') throw new TypeError(`${name} is no string`);
  return value;
}

function numberOf(fields: Fields, name: string): number {
  const value = fields[name];
  if (typeof value !== 'number') throw new TypeError(`${name} is no number`);
  return value;
}

function numbersOf(fields: Fields, name: string): number[] {
  return listOf(fields, name, (item): item is number => typeof item === 'number');
}

function stringsOf(fields: Fields, name: string): string[] {
  return listOf(fields, name, (item): item is string => typeof item === 'string');
}

function listOf<Item>(
  fields: Fields,
  name: string,
  isItem: (item: unknown) => item is Item,
): Item[] {
  const value = fields[name];
  if (!Array.isArray(value) || !value.every(isItem)) {
    throw new TypeError(`${name} is no list of the kind it needs`);
  }
  return value;
}
