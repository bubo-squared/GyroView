import { locateOtherLensFile, locateProxy } from '@gyroview/core';

import { hasErrorCode } from './errorCodes';
import type { OpenedRecording } from './OpenedRecording';
import { openInputs, type OpenAttempt } from './openInputs';
import type { RecordingPorts } from './ports';
import { inputName, isUrlInput, type MediaInput, type PlayerSource } from '../PlayerSource';

interface Context {
  readonly ports: RecordingPorts;
  readonly signal: AbortSignal;
}

const NO_PROXY_WARNING =
  'no proxy was given or found beside the recording; playing the recording itself';

/**
 * Use case at the composition root: opens what a source names, following the data. A lone
 * file of a split-file pair fetches its sibling when the server has it; a recording this
 * browser cannot decode falls back to its proxy when the quality setting allows; the proxy is
 * looked for beside a URL only when asked. Aborting releases everything opened so far.
 */
export async function openRecording(
  source: PlayerSource,
  ports: RecordingPorts,
  signal: AbortSignal,
): Promise<OpenedRecording> {
  const context = { ports, signal };
  const proxy = await proxyInputOf(source, ports);
  signal.throwIfAborted();
  const isProxyPreferred = source.quality === 'proxy';
  return proxy && isProxyPreferred
    ? openProxy(proxy, context, [])
    : openWithFallback(source, proxy, context);
}

/**
 * The recording itself, then the proxy if the recording turns out undecodable here.
 */
async function openWithFallback(
  source: PlayerSource,
  proxy: MediaInput | undefined,
  context: Context,
): Promise<OpenedRecording> {
  const details = {
    notes: source.quality === 'proxy' ? [NO_PROXY_WARNING] : [],
    proxyName: proxy && inputName(proxy),
  };
  try {
    return await openMainInputs(source, context, details);
  } catch (error) {
    const fallback = mayFallBackTo(proxy, source.quality, error);
    if (!fallback) throw error;
    return openProxyAfter(error, fallback, context);
  }
}

/**
 * The proxy is a fallback only for a recording this browser cannot decode, and only when the
 * quality setting leaves the choice open.
 */
function mayFallBackTo(
  proxy: MediaInput | undefined,
  quality: PlayerSource['quality'],
  error: unknown,
): MediaInput | undefined {
  const isAllowed = quality !== 'full' && hasErrorCode(error, 'codec-unsupported');
  return isAllowed ? proxy : undefined;
}

interface MainAttemptDetails {
  readonly notes: readonly string[];
  readonly proxyName: string | undefined;
}

/**
 * The recording itself, retried once with the other lens's file when the layout says the
 * given file is one half of a pair and the server has the sibling.
 */
async function openMainInputs(
  source: PlayerSource,
  context: Context,
  details: MainAttemptDetails,
): Promise<OpenedRecording> {
  const attempt: OpenAttempt = { ...context, ...details, isProxy: false };
  const inputs = source.second ? [source.main, source.second] : [source.main];
  try {
    return await openInputs(inputs, attempt);
  } catch (error) {
    const isLoneHalf = source.second === undefined && hasErrorCode(error, 'missing-second-file');
    if (!isLoneHalf || !isUrlInput(source.main)) throw error;
    const second = await locateOtherLensFile(source.main.url, context.ports.locator);
    context.signal.throwIfAborted();
    if (!second) throw error;
    return openInputs([source.main, { url: second }], attempt);
  }
}

function openProxy(
  proxy: MediaInput,
  context: Context,
  notes: readonly string[],
): Promise<OpenedRecording> {
  return openInputs([proxy], { ...context, isProxy: true, proxyName: inputName(proxy), notes });
}

/**
 * The proxy after the recording proved undecodable; when the proxy fails too, the original
 * failure is the one worth reporting.
 */
async function openProxyAfter(
  cause: unknown,
  proxy: MediaInput,
  context: Context,
): Promise<OpenedRecording> {
  const reason = cause instanceof Error ? cause.message : String(cause);
  try {
    return await openProxy(proxy, context, [`playing the proxy: ${reason}`]);
  } catch (proxyError) {
    if (proxyError instanceof DOMException) throw proxyError;
    throw cause;
  }
}

async function proxyInputOf(
  source: PlayerSource,
  ports: RecordingPorts,
): Promise<MediaInput | undefined> {
  if (source.proxy) return source.proxy;
  if (!source.shouldDiscoverProxy || !isUrlInput(source.main)) return undefined;
  const url = await locateProxy(source.main.url, ports.locator);
  return url === undefined ? undefined : { url };
}
