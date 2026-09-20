import { HttpResourceLocator, type HttpRangeSourceOptions } from '@gyroview/adapter-fetch';
import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import { WebCodecsVideoDecoderPort } from '@gyroview/adapter-webcodecs';

import { BrowserSourceOpener } from './BrowserSourceOpener';
import { deadlineIn } from './deadline';
import type { RecordingPorts } from './ports';

export interface BrowserPortsOptions {
  /**
   * Shared by every request the player makes for the recording and its companions.
   */
  readonly http?: HttpRangeSourceOptions;
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
    sources: new BrowserSourceOpener(http),
    demuxer: new MediabunnyDemuxer(),
    // A hard hardware preference refuses codecs the browser could decode in software (H.264
    // proxies on machines without a hardware decoder); with no preference the browser still
    // picks hardware when it has it.
    decoderPort: new WebCodecsVideoDecoderPort({ hardwareAcceleration: 'no-preference' }),
    locator: new HttpResourceLocator(http),
    probeDeadline: () => deadlineIn(probeTimeoutMs),
  };
}
