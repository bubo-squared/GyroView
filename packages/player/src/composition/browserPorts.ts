import { BlobRandomAccessSource } from '@gyroview/adapter-blob';
import {
  HttpByteStream,
  HttpRangeSource,
  HttpResource,
  HttpResourceLocator,
  type HttpRequestOptions,
} from '@gyroview/adapter-fetch';
import { MediabunnyAudioPackager, MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';
import { Deferred, SourceByteStream } from '@gyroview/core';

import type { OpenedSource, RecordingPorts, SourceOpener } from './ports';
import { isUrlInput, type BlobInput, type UrlInput } from '../PlayerSource';

export interface BrowserPortsOptions {
  /**
   * Shared by every request the player makes for the recording and its other lens file. A
   * recording's own `credentials` and `fetch` (`UrlInput`) take the place of theirs.
   */
  readonly http?: HttpRequestOptions;
  /**
   * How long the decode probe may take before a lens is reported as timed out. Default 15 s,
   * generous because hardware decoders wake slowly.
   */
  readonly probeTimeoutMs?: number;
}

const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

/**
 * The real adapters behind the player in a browser.
 */
export function browserPorts(options: BrowserPortsOptions = {}): RecordingPorts<VideoFrame> {
  const http = options.http ?? {};
  const probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  return {
    sources: browserSources(http),
    codecReader: new MediabunnyCodecReader(),
    audioPackager: new MediabunnyAudioPackager(),
    decoderPort: new WebCodecsVideoDecoderPort(),
    locatorFor: (input) => new HttpResourceLocator(requestOptionsFor(http, input)),
    probeDeadline: () => deadlineIn(probeTimeoutMs),
  };
}

/**
 * URLs are read with HTTP ranges, both ways over one resource; blobs by slicing, a range whole.
 */
export function browserSources(http: HttpRequestOptions): SourceOpener {
  return {
    open: (input, signal) =>
      isUrlInput(input) ? urlSource(input, http, signal) : blobSource(input),
  };
}

function urlSource(input: UrlInput, http: HttpRequestOptions, signal: AbortSignal): OpenedSource {
  const resource = new HttpResource(input.url, requestOptionsFor(http, input), signal);
  return { source: new HttpRangeSource(resource), stream: new HttpByteStream(resource) };
}

function blobSource(input: BlobInput): OpenedSource {
  const source = new BlobRandomAccessSource(input.blob);
  return { source, stream: new SourceByteStream(source) };
}

/**
 * The shared request settings, with the input's own credentials and fetch in place of theirs when
 * it names any: how the element's `crossorigin` and `fetch` reach every request for its recording
 * (ADR 0027, ADR 0043). An input that names neither is read with the shared settings themselves.
 */
function requestOptionsFor(http: HttpRequestOptions, input: UrlInput): HttpRequestOptions {
  const { credentials, fetch } = input;
  const withCredentials =
    credentials === undefined
      ? http
      : { ...http, requestInit: { ...http.requestInit, credentials } };
  return fetch === undefined ? withCredentials : { ...withCredentials, fetch };
}

/**
 * A deadline that passes after `ms`: the core has no timers, so the host supplies deadlines.
 */
function deadlineIn(ms: number): Deferred<void> {
  const deadline = new Deferred<void>();
  setTimeout(() => {
    deadline.resolve();
  }, ms);
  return deadline;
}
