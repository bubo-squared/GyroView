import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * How a slow link carries a range body: a chunk at a time, one per interval.
 */
export interface Throttle {
  readonly chunkBytes: number;
  readonly intervalMs: number;
}

/**
 * What the server tells of the recording's version, as S3 and CDNs do on every answer.
 */
export interface Validators {
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface TestServerBehaviour {
  /**
   * Answer byte ranges with the whole body and status 200, like a server without Range support.
   */
  readonly ignoresRanges?: boolean;
  /**
   * Omit Content-Length from HEAD responses.
   */
  readonly hidesContentLength?: boolean;
  /**
   * Answer HEAD with this status, as a server that does not allow it (405) or a URL signed for
   * GET alone (403) does.
   */
  readonly answersHeadWith?: number;
  /**
   * Answer every request with this status.
   */
  readonly failsWith?: number;
  /**
   * Cut the connection halfway through this many range bodies, the first ones asked for, as a
   * dropped network does.
   */
  readonly breaksOffRanges?: number;
  /**
   * Stop sending this many range bodies halfway, the first ones asked for, and hold the
   * connection open until the client gives up, as a stalled network does.
   */
  readonly stallsRanges?: number;
  readonly throttle?: Throttle;
  readonly validators?: Validators;
}

/**
 * One request the server was sent, and whether its answer ended before its last byte: given up
 * by the client, or broken off by the server.
 */
export interface LoggedRequest {
  readonly method: string;
  readonly range: string | undefined;
  readonly wasCutShort: boolean;
}

interface Served {
  body: Uint8Array;
  validators: Validators;
  readonly behaviour: TestServerBehaviour;
  rangesToBreakOff: number;
  rangesToStall: number;
  readonly log: { -readonly [key in keyof LoggedRequest]: LoggedRequest[key] }[];
}

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const RANGE_HEADER = /^bytes=(\d+)-(\d+)$/u;

/**
 * In-process HTTP server for the fetch adapter tests: serves one byte array with configurable
 * misbehaviour so every error path of the source can be exercised without the network, and logs
 * what it was asked.
 */
export class TestServer {
  private constructor(
    private readonly server: Server,
    private readonly served: Served,
    public readonly url: string,
  ) {}

  public static async start(
    body: Uint8Array,
    behaviour: TestServerBehaviour = {},
  ): Promise<TestServer> {
    const served: Served = {
      body,
      validators: behaviour.validators ?? {},
      behaviour,
      rangesToBreakOff: behaviour.breaksOffRanges ?? 0,
      rangesToStall: behaviour.stallsRanges ?? 0,
      log: [],
    };
    const server = createServer((request, response) => {
      logRequest(request, response, served);
      respond(request, response, served);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return new TestServer(server, served, `http://127.0.0.1:${port}/recording.insv`);
  }

  public get requests(): LoggedRequest[] {
    return this.served.log.map((request) => ({ ...request }));
  }

  /**
   * The recording at the URL is replaced, as when it is uploaded again.
   */
  public replace(body: Uint8Array, validators: Validators): void {
    this.served.body = body;
    this.served.validators = validators;
  }

  public async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function logRequest(request: IncomingMessage, response: ServerResponse, served: Served): void {
  const logged = { method: request.method ?? '', range: request.headers.range, wasCutShort: false };
  served.log.push(logged);
  response.on('close', () => {
    logged.wasCutShort = !response.writableFinished;
  });
}

function respond(request: IncomingMessage, response: ServerResponse, served: Served): void {
  const refusal = refusalOf(request, served.behaviour);
  if (refusal !== undefined) {
    response.writeHead(refusal).end();
    return;
  }
  response.setHeader('Accept-Ranges', 'bytes');
  setValidators(response, served.validators);
  const asked = rangeAskedIn(request, served.behaviour);
  if (asked) respondWithRange(response, served, asked);
  else respondWhole(request, response, served);
}

/**
 * The bytes a `Range` header asks for, inclusive, and whether the request wants only headers.
 */
interface RangeAsked {
  readonly first: number;
  readonly last: number;
  readonly isHead: boolean;
}

function rangeAskedIn(
  request: IncomingMessage,
  behaviour: TestServerBehaviour,
): RangeAsked | undefined {
  const range = RANGE_HEADER.exec(request.headers.range ?? '');
  const isHead = request.method === 'HEAD';
  return range && !behaviour.ignoresRanges
    ? { first: Number(range[1]), last: Number(range[2]), isHead }
    : undefined;
}

/**
 * The status a misbehaving server answers this request with instead of the content.
 */
function refusalOf(request: IncomingMessage, behaviour: TestServerBehaviour): number | undefined {
  if (behaviour.failsWith !== undefined) return behaviour.failsWith;
  return request.method === 'HEAD' ? behaviour.answersHeadWith : undefined;
}

function setValidators(response: ServerResponse, { etag, lastModified }: Validators): void {
  if (etag !== undefined) response.setHeader('ETag', etag);
  if (lastModified !== undefined) response.setHeader('Last-Modified', lastModified);
}

function respondWithRange(response: ServerResponse, served: Served, asked: RangeAsked): void {
  const { body } = served;
  const { first } = asked;
  const last = Math.min(asked.last, body.byteLength - 1);
  response.setHeader('Content-Range', `bytes ${first}-${last}/${body.byteLength}`);
  response.setHeader('Content-Length', String(last - first + 1));
  response.writeHead(HTTP_PARTIAL_CONTENT);
  if (asked.isHead) response.end();
  else sendRange(response, served, body.subarray(first, last + 1));
}

/**
 * A range body, sent as the server's behaviour has it: broken off or stalled halfway, throttled,
 * or at once.
 */
function sendRange(response: ServerResponse, served: Served, bytes: Uint8Array): void {
  const half = bytes.subarray(0, Math.floor(bytes.byteLength / 2));
  if (served.rangesToBreakOff > 0) {
    served.rangesToBreakOff -= 1;
    response.write(half, () => {
      response.destroy();
    });
  } else if (served.rangesToStall > 0) {
    served.rangesToStall -= 1;
    response.write(half);
  } else if (served.behaviour.throttle) {
    sendThrottled(response, bytes, served.behaviour.throttle);
  } else {
    response.end(bytes);
  }
}

function sendThrottled(response: ServerResponse, bytes: Uint8Array, throttle: Throttle): void {
  let sent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sendNext = (): void => {
    const chunk = bytes.subarray(sent, sent + throttle.chunkBytes);
    sent += chunk.byteLength;
    if (sent >= bytes.byteLength) {
      response.end(chunk);
      return;
    }
    response.write(chunk);
    timer = setTimeout(sendNext, throttle.intervalMs);
  };
  response.on('close', () => {
    clearTimeout(timer);
  });
  sendNext();
}

function respondWhole(request: IncomingMessage, response: ServerResponse, served: Served): void {
  const { body, behaviour } = served;
  if (!behaviour.hidesContentLength) response.setHeader('Content-Length', String(body.byteLength));
  response.writeHead(HTTP_OK);
  response.end(request.method === 'HEAD' ? undefined : body);
}
