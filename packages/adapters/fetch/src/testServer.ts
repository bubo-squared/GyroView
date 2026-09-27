import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

interface TestServerBehaviour {
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
   * Cut the connection halfway through every range body, as a dropped network does.
   */
  readonly breaksOffRanges?: boolean;
}

interface Served {
  readonly body: Uint8Array;
  readonly behaviour: TestServerBehaviour;
}

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const RANGE_HEADER = /^bytes=(\d+)-(\d+)$/u;

/**
 * In-process HTTP server for the fetch adapter tests: serves one byte array with configurable
 * misbehaviour so every error path of the source can be exercised without the network.
 */
export class TestServer {
  private constructor(
    private readonly server: Server,
    public readonly url: string,
  ) {}

  public static async start(
    body: Uint8Array,
    behaviour: TestServerBehaviour = {},
  ): Promise<TestServer> {
    const served: Served = { body, behaviour };
    const server = createServer((request, response) => {
      respond(request, response, served);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return new TestServer(server, `http://127.0.0.1:${port}/recording.insv`);
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function respond(request: IncomingMessage, response: ServerResponse, served: Served): void {
  const refusal = refusalOf(request, served.behaviour);
  if (refusal !== undefined) {
    response.writeHead(refusal).end();
    return;
  }
  response.setHeader('Accept-Ranges', 'bytes');
  const range = RANGE_HEADER.exec(request.headers.range ?? '');
  if (range && !served.behaviour.ignoresRanges) {
    const asked = { body: served.body, range };
    if (served.behaviour.breaksOffRanges === true) breakOffRange(response, asked);
    else respondWithRange(request, response, asked);
  } else {
    respondWhole(request, response, served);
  }
}

/**
 * The status a misbehaving server answers this request with instead of the content.
 */
function refusalOf(request: IncomingMessage, behaviour: TestServerBehaviour): number | undefined {
  if (behaviour.failsWith !== undefined) return behaviour.failsWith;
  return request.method === 'HEAD' ? behaviour.answersHeadWith : undefined;
}

/**
 * The part of the body a `Range` header asked for.
 */
interface RangeAsked {
  readonly body: Uint8Array;
  readonly range: RegExpExecArray;
}

function respondWithRange(
  request: IncomingMessage,
  response: ServerResponse,
  { body, range }: RangeAsked,
): void {
  const start = Number(range[1]);
  const end = Math.min(Number(range[2]), body.byteLength - 1);
  response.setHeader('Content-Range', `bytes ${start}-${end}/${body.byteLength}`);
  response.setHeader('Content-Length', String(end - start + 1));
  response.writeHead(HTTP_PARTIAL_CONTENT);
  response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
}

function breakOffRange(response: ServerResponse, { body, range }: RangeAsked): void {
  const start = Number(range[1]);
  const end = Math.min(Number(range[2]), body.byteLength - 1);
  response.setHeader('Content-Length', String(end - start + 1));
  response.writeHead(HTTP_PARTIAL_CONTENT);
  response.write(body.subarray(start, start + Math.floor((end - start) / 2)), () => {
    response.destroy();
  });
}

function respondWhole(request: IncomingMessage, response: ServerResponse, served: Served): void {
  const { body, behaviour } = served;
  if (!behaviour.hidesContentLength) response.setHeader('Content-Length', String(body.byteLength));
  response.writeHead(HTTP_OK);
  response.end(request.method === 'HEAD' ? undefined : body);
}
