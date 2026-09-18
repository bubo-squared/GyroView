// Phase 0 spike helper: serves ../samples over HTTP with the headers a
// production host must provide (CORS, byte ranges). Throwaway code.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = fileURLToPath(new URL('../samples/', import.meta.url));

const CONTENT_TYPES = {
  '.insv': 'video/mp4',
  '.lrv': 'video/mp4',
  '.mp4': 'video/mp4',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Accept-Ranges': 'bytes',
};

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const [, startText, endText] = match;
  if (startText === '' && endText === '') return null;
  const start = startText === '' ? Math.max(size - Number(endText), 0) : Number(startText);
  const end = endText === '' || startText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

async function resolveFile(urlPath) {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, relative);
  const resolved = await realpath(candidate);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error('not a file');
  return { path: resolved, size: info.size };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }
  let file;
  try {
    file = await resolveFile(url.pathname);
  } catch {
    response.writeHead(404, CORS_HEADERS);
    response.end('not found');
    return;
  }
  const contentType = CONTENT_TYPES[extname(file.path).toLowerCase()] ?? 'application/octet-stream';
  const range = parseRange(request.headers.range, file.size);
  if (range?.invalid) {
    response.writeHead(416, { ...CORS_HEADERS, 'Content-Range': `bytes */${file.size}` });
    response.end();
    return;
  }
  const { start, end } = range ?? { start: 0, end: file.size - 1 };
  const headers = {
    ...CORS_HEADERS,
    'Content-Type': contentType,
    'Content-Length': String(end - start + 1),
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}),
  };
  response.writeHead(range ? 206 : 200, headers);
  console.log(`${request.method} ${url.pathname} ${range ? `bytes ${start}-${end}` : 'full'}`);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file.path, { start, end }).pipe(response);
});

server.listen(PORT, () => console.log(`samples served from ${ROOT} at http://localhost:${PORT}/`));
