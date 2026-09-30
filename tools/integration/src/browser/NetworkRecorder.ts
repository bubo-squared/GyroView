/**
 * The byte range a request asked for, end exclusive.
 */
export interface RequestedRange {
  readonly start: number;
  readonly end: number;
}

/**
 * One request the player made, as far as it had got when looked at.
 */
export interface RecordedRequest {
  readonly method: string;
  readonly range: RequestedRange | undefined;
  /**
   * Page time, in milliseconds (`performance.now()`), of the request, and of its last byte or its
   * abort.
   */
  readonly startedAt: number;
  readonly finishedAt: number | undefined;
  readonly bytesReceived: number;
  readonly wasAborted: boolean;
}

/**
 * The network a recorder plays the part of: how fast bodies arrive and how long a request waits
 * for its answer.
 */
export interface NetworkLink {
  readonly megabitsPerSecond: number;
  readonly latencyMs: number;
}

const BITS_PER_BYTE = 8;
const BITS_PER_MEGABIT = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const RANGE_HEADER = /^bytes=(?<start>\d+)-(?<last>\d+)$/u;

/**
 * Wraps `fetch` for the player (`http.fetch`): records every request with the bytes that came
 * and whether it was aborted, and lets the bodies through no faster than the link, all requests
 * sharing it as one page's requests share its connection. Served from localhost, playback then
 * meets the waits and the cancellations a real network would put it through.
 */
export class NetworkRecorder {
  public readonly fetch: typeof fetch;
  private readonly records: RequestRecord[] = [];
  private readonly link: SharedLink;

  public constructor(private readonly network: NetworkLink) {
    this.link = new SharedLink(network.megabitsPerSecond);
    this.fetch = (input, init): Promise<Response> => this.recordedFetch(input, init);
  }

  public requests(): readonly RecordedRequest[] {
    return this.records.map((record) => record.snapshot());
  }

  public bytesReceived(): number {
    return this.records.reduce((total, record) => total + record.snapshot().bytesReceived, 0);
  }

  private async recordedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const record = new RequestRecord(init);
    this.records.push(record);
    await pause(this.network.latencyMs);
    const response = await fetch(input, init);
    if (!response.body) {
      record.finish();
      return response;
    }
    const body = response.body.pipeThrough(this.meteredBy(record));
    const { status, statusText, headers } = response;
    return new Response(body, { status, statusText, headers });
  }

  /**
   * Passes each chunk on once the link has carried it, counting it for the request.
   */
  private meteredBy(record: RequestRecord): TransformStream<Uint8Array, Uint8Array> {
    return new TransformStream({
      transform: async (chunk, controller): Promise<void> => {
        await this.link.carry(chunk.byteLength);
        record.receive(chunk.byteLength);
        controller.enqueue(chunk);
      },
      flush: (): void => {
        record.finish();
      },
    });
  }
}

/**
 * The bandwidth every body shares: a chunk passes once the chunks queued before it have.
 */
class SharedLink {
  private readonly bytesPerMillisecond: number;
  private freeAt = 0;

  public constructor(megabitsPerSecond: number) {
    const bitsPerMillisecond = (megabitsPerSecond * BITS_PER_MEGABIT) / MILLISECONDS_PER_SECOND;
    this.bytesPerMillisecond = bitsPerMillisecond / BITS_PER_BYTE;
  }

  public carry(byteCount: number): Promise<void> {
    const now = performance.now();
    this.freeAt = Math.max(now, this.freeAt) + byteCount / this.bytesPerMillisecond;
    return pause(this.freeAt - now);
  }
}

/**
 * What one request has done so far; the recorder hands out snapshots.
 */
class RequestRecord {
  private readonly method: string;
  private readonly range: RequestedRange | undefined;
  private readonly startedAt = performance.now();
  private finishedAt: number | undefined;
  private bytesReceived = 0;
  private wasAborted = false;

  public constructor(init: RequestInit | undefined) {
    this.method = init?.method ?? 'GET';
    this.range = rangeOf(new Headers(init?.headers).get('range'));
    init?.signal?.addEventListener(
      'abort',
      () => {
        if (this.finishedAt !== undefined) return;
        this.wasAborted = true;
        this.finishedAt = performance.now();
      },
      { once: true },
    );
  }

  public receive(byteCount: number): void {
    this.bytesReceived += byteCount;
  }

  public finish(): void {
    this.finishedAt = performance.now();
  }

  public snapshot(): RecordedRequest {
    const { method, range, startedAt, finishedAt, bytesReceived, wasAborted } = this;
    return { method, range, startedAt, finishedAt, bytesReceived, wasAborted };
  }
}

function rangeOf(header: string | null): RequestedRange | undefined {
  const groups = RANGE_HEADER.exec(header ?? '')?.groups;
  const start = groups?.['start'];
  const last = groups?.['last'];
  return start === undefined || last === undefined
    ? undefined
    : { start: Number(start), end: Number(last) + 1 };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
