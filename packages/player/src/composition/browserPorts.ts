import { BlobRandomAccessSource } from '@gyroview/adapter-blob';
import {
  HttpRangeSource,
  HttpResourceLocator,
  type HttpRequestOptions,
} from '@gyroview/adapter-fetch';
import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';
import { Deferred } from '@gyroview/core';

import type { RecordingPorts, SourceOpener } from './ports';
import { isUrlInput, type UrlInput } from '../PlayerSource';

export interface BrowserPortsOptions {
  /**
   * Shared by every request the player makes for the recording and its other lens file.
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
    demuxer: new MediabunnyDemuxer(),
    decoderPort: new WebCodecsVideoDecoderPort(),
    locatorFor: (input) => new HttpResourceLocator(requestOptionsFor(http, input)),
    probeDeadline: () => deadlineIn(probeTimeoutMs),
  };
}

/**
 * URLs are read with HTTP ranges, blobs by slicing.
 */
export function browserSources(http: HttpRequestOptions): SourceOpener {
  return {
    open: (input, signal) =>
      isUrlInput(input)
        ? new HttpRangeSource(input.url, requestOptionsFor(http, input), signal)
        : new BlobRandomAccessSource(input.blob),
  };
}

/**
 * The shared request settings, with the input's own credentials in place of theirs when it names
 * any: how the element's `crossorigin` reaches every request for its recording (ADR 0027).
 */
function requestOptionsFor(http: HttpRequestOptions, input: UrlInput): HttpRequestOptions {
  const { credentials } = input;
  return credentials === undefined
    ? http
    : { ...http, requestInit: { ...http.requestInit, credentials } };
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
