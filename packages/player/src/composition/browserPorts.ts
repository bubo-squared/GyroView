import { BlobRandomAccessSource } from '@gyroview/adapter-blob';
import {
  HttpRangeSource,
  HttpResourceLocator,
  type HttpRequestOptions,
} from '@gyroview/adapter-fetch';
import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';
import { Signal } from '@gyroview/core';

import type { RecordingPorts, SourceOpener } from './ports';
import { isUrlInput } from '../PlayerSource';

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
    sources: sourcesOver(http),
    demuxer: new MediabunnyDemuxer(),
    decoderPort: new WebCodecsVideoDecoderPort(),
    locator: new HttpResourceLocator(http),
    probeDeadline: () => deadlineIn(probeTimeoutMs),
  };
}

/**
 * URLs are read with HTTP ranges, blobs by slicing.
 */
function sourcesOver(http: HttpRequestOptions): SourceOpener {
  return {
    open: (input) =>
      isUrlInput(input)
        ? new HttpRangeSource(input.url, http)
        : new BlobRandomAccessSource(input.blob),
  };
}

/**
 * A signal that fires after `ms`: the core has no timers, so the host supplies deadlines.
 */
function deadlineIn(ms: number): Signal {
  const signal = new Signal();
  setTimeout(() => {
    signal.trigger();
  }, ms);
  return signal;
}
