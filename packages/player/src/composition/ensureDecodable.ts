import {
  GyroViewError,
  probeDecoding,
  type DecodeProbeReport,
  type GyroViewErrorCode,
  type ProbeVerdict,
  type Deferred,
  type VideoTrackReader,
} from '@gyroview/core';

import type { OpenAttempt } from './OpenAttempt';

interface ProbeFailure {
  readonly code: GyroViewErrorCode;
  readonly message: string;
}

/**
 * Probes that this platform decodes every frame source, and refuses the recording with the
 * cause when it does not: the browser's, the file's or the network's.
 */
export async function ensureDecodable(
  frameSources: readonly VideoTrackReader[],
  attempt: OpenAttempt,
): Promise<void> {
  const { ports, signal } = attempt;
  const report = await probeDecoding(frameSources, ports.decoderPort, probeDeadlineOf(attempt));
  signal.throwIfAborted();
  if (!report.canDecode) throw probeFailure(report);
}

/**
 * The failures that are not the browser's, by the verdict every failed track shares: a file
 * without a key frame to start from, or a network too slow to bring one before the deadline.
 */
const FAILURES_NOT_OF_THE_BROWSER: Partial<Record<ProbeVerdict, ProbeFailure>> = {
  'no-key-frame': {
    code: 'no-key-frame',
    message: 'the recording has no key frame to start decoding from',
  },
  'key-frame-late': {
    code: 'source-unreadable',
    message: "the recording's first frames did not arrive in time",
  },
};

const BROWSER_CANNOT_DECODE: ProbeFailure = {
  code: 'codec-unsupported',
  message: 'this browser cannot decode the recording',
};

function probeFailure(report: DecodeProbeReport): GyroViewError {
  const cause = sharedCause(report);
  const failure = cause === undefined ? undefined : FAILURES_NOT_OF_THE_BROWSER[cause];
  const { code, message } = failure ?? BROWSER_CANNOT_DECODE;
  return new GyroViewError(code, `${message}: ${describeProbe(report)}`);
}

/**
 * The verdict every failed track shares, if one does. A decoder still busy at the deadline beside
 * a key frame that never came is taken for the same slow link's doing.
 */
function sharedCause(report: DecodeProbeReport): ProbeVerdict | undefined {
  const verdicts = new Set(
    report.sources.filter((source) => source.verdict !== 'decodes').map((source) => source.verdict),
  );
  if (verdicts.has('key-frame-late')) verdicts.delete('timed-out');
  const [shared] = verdicts;
  return verdicts.size === 1 ? shared : undefined;
}

/**
 * The probe's deadline, brought forward by an abort: a superseded load lets its probe decoders
 * go at once, which matters where decoders are few (iOS Safari).
 */
function probeDeadlineOf(attempt: OpenAttempt): Deferred<void> {
  const deadline = attempt.ports.probeDeadline();
  attempt.signal.addEventListener(
    'abort',
    () => {
      deadline.resolve();
    },
    { once: true },
  );
  return deadline;
}

function describeProbe(report: DecodeProbeReport): string {
  return report.sources
    .filter((lens) => lens.verdict !== 'decodes')
    .map(
      (lens) =>
        `track ${lens.track.trackIndex} ${lens.verdict}${lens.detail ? ` (${lens.detail})` : ''}`,
    )
    .join('; ');
}
