import type { RecordingPorts } from './ports';

/**
 * What opening a recording works with: the ports it reads through and the signal that aborts it.
 */
export interface OpenAttempt {
  readonly ports: RecordingPorts;
  readonly signal: AbortSignal;
  /**
   * Where the other lens file of a lone file is, when the server has it; absent where there is
   * nothing to look for (a pair given whole, a local file).
   */
  readonly findSecondFile?: () => Promise<string | undefined>;
}
