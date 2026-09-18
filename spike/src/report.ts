// Collects spike results for the Playwright runner and mirrors them on the page.

export interface SpikeResults {
  done: boolean;
  userAgent: string;
  steps: Record<string, unknown>;
  errors: string[];
}

const results: SpikeResults = {
  done: false,
  userAgent: navigator.userAgent,
  steps: {},
  errors: [],
};
(globalThis as unknown as { __spikeResults: SpikeResults }).__spikeResults = results;

const logElement = document.querySelector<HTMLPreElement>('#log');

export function log(text: string, className = ''): void {
  const line = document.createElement('div');
  line.textContent = text;
  if (className) line.className = className;
  logElement?.append(line);
  console.log(text);
}

export function record(step: string, value: unknown): void {
  results.steps[step] = value;
  log(`${step}: ${JSON.stringify(value)}`, 'ok');
}

export function recordFailure(step: string, error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  results.errors.push(`${step}: ${message}`);
  results.steps[step] = { error: message };
  log(`${step} FAILED: ${message}`, 'fail');
}

export function finish(): void {
  results.done = true;
  log('done');
}
