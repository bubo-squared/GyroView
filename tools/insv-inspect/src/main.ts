import { GyroViewError } from '@gyroview/core';

import { inspectFile } from './inspectFile';
import { renderInspection } from './renderInspection';

const USAGE = 'usage: insv-inspect <file.insv> [--json]';
const EXIT_USAGE = 2;
const EXIT_FAILURE = 1;
const JSON_INDENT = 2;

async function main(argv: readonly string[]): Promise<number> {
  const file = argv.find((argument) => !argument.startsWith('--'));
  if (!file) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT_USAGE;
  }
  const inspection = await inspectFile(file);
  const output = argv.includes('--json')
    ? JSON.stringify(inspection, null, JSON_INDENT)
    : renderInspection(inspection);
  process.stdout.write(`${output}\n`);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${describeError(error)}\n`);
  process.exitCode = EXIT_FAILURE;
}

function describeError(error: unknown): string {
  if (error instanceof GyroViewError) {
    const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : '';
    return `[${error.code}] ${error.message}${cause}`;
  }
  return error instanceof Error ? error.message : String(error);
}
