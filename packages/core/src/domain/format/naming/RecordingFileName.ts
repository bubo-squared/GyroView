/**
 * Insta360 file names follow `VID_20260814_132640_00_013.insv`: a prefix, the capture date and
 * time, a two-digit stream code and a sequence number. In the stream code the first digit names
 * the lens (0 the back lens, 1 the screen-side lens) and the second marks a proxy (0 the
 * recording itself, 1 its low-resolution LRV). Seen on the X5 samples (`VID_..._00_` with
 * `LRV_..._01_`) and documented by the community for the `_00_`/`_10_` pairs of older cameras.
 * The name is only ever a hint: whatever it suggests is verified against the file's contents.
 */
const FILE_NAME_PATTERN =
  /^(?<prefix>[A-Za-z]+(?:_[A-Za-z]+)*)_(?<stamp>\d{8}_\d{6})_(?<lens>\d)(?<proxy>\d)_(?<sequence>\d{3})\.(?<extension>[A-Za-z0-9]+)$/u;

const BACK_LENS_DIGIT = 0;
const SCREEN_LENS_DIGIT = 1;
const RECORDING_DIGIT = 0;
const PROXY_DIGIT = 1;
const PROXY_PREFIX = 'LRV';
const PROXY_EXTENSION = 'lrv';

interface RecordingFileNameParts {
  readonly prefix: string;
  readonly captureStamp: string;
  readonly lensDigit: number;
  readonly proxyDigit: number;
  readonly sequence: string;
  readonly extension: string;
}

/**
 * Value object over a camera file name; derives the names of the files the camera writes beside
 * it (see {@link otherLensName} and {@link proxyName}).
 */
export class RecordingFileName {
  private constructor(private readonly parts: RecordingFileNameParts) {}

  /**
   * Undefined for names that do not follow the camera's convention.
   */
  public static parse(fileName: string): RecordingFileName | undefined {
    const groups = FILE_NAME_PATTERN.exec(fileName)?.groups;
    return groups ? new RecordingFileName(partsOf(groups)) : undefined;
  }

  public get isBackLens(): boolean {
    return this.parts.lensDigit === BACK_LENS_DIGIT;
  }

  public get isScreenLens(): boolean {
    return this.parts.lensDigit === SCREEN_LENS_DIGIT;
  }

  public get isProxy(): boolean {
    return this.parts.proxyDigit === PROXY_DIGIT;
  }

  /**
   * The file holding the other lens of a split-file recording: `_00_` for `_10_` and back.
   */
  public otherLensName(): string {
    const lensDigit = this.isBackLens ? SCREEN_LENS_DIGIT : BACK_LENS_DIGIT;
    return this.withParts({ lensDigit, proxyDigit: RECORDING_DIGIT }).toString();
  }

  /**
   * The low-resolution proxy the camera writes beside this file, keeping the lens digit: the
   * packed `LRV_..._01_` of one-file recordings, or the per-lens proxy of a split-file pair.
   */
  public proxyName(): string {
    return this.withParts({
      prefix: PROXY_PREFIX,
      proxyDigit: PROXY_DIGIT,
      extension: PROXY_EXTENSION,
    }).toString();
  }

  public toString(): string {
    const { prefix, captureStamp, lensDigit, proxyDigit, sequence, extension } = this.parts;
    return `${prefix}_${captureStamp}_${lensDigit}${proxyDigit}_${sequence}.${extension}`;
  }

  private withParts(changes: Partial<RecordingFileNameParts>): RecordingFileName {
    return new RecordingFileName({ ...this.parts, ...changes });
  }
}

function partsOf(groups: Record<string, string | undefined>): RecordingFileNameParts {
  return {
    prefix: groups['prefix'] ?? '',
    captureStamp: groups['stamp'] ?? '',
    lensDigit: Number(groups['lens']),
    proxyDigit: Number(groups['proxy']),
    sequence: groups['sequence'] ?? '',
    extension: groups['extension'] ?? '',
  };
}
