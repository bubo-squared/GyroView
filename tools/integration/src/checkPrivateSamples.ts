/**
 * Refuses words of a private recording (ADR 0031): the file names, serials and other words the
 * local catalogue lists as private, which must never reach the public repository.
 *
 *   node tools/integration/src/checkPrivateSamples.ts            tracked and new files
 *   node tools/integration/src/checkPrivateSamples.ts --staged   what the next commit holds
 *   node tools/integration/src/checkPrivateSamples.ts --message <file>   a commit message
 *
 * Without a catalogue, as in CI, there is nothing to look for.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { localSampleEntries } from './localCatalogueFile.ts';

const GREP_FOUND_NOTHING = 1;
const MESSAGE_OPTION = '--message';
const STAGED_OPTION = '--staged';

/**
 * The files holding `word` in any case, as `git grep` finds them in the working tree or the index.
 */
function filesHolding(word: string, where: string): string[] {
  try {
    const output = execFileSync('git', ['grep', where, '-l', '-i', '-F', '-e', word], {
      encoding: 'utf8',
    });
    return output.split('\n').filter((line) => line !== '');
  } catch (error) {
    if ((error as { status?: number }).status === GREP_FOUND_NOTHING) return [];
    throw error;
  }
}

function messageFindings(words: readonly string[], messageFile: string): string[] {
  const message = readFileSync(messageFile, 'utf8').toLowerCase();
  return words.flatMap((word, index) =>
    message.includes(word.toLowerCase()) ? [`the commit message (private word ${index + 1})`] : [],
  );
}

function fileFindings(words: readonly string[], where: string): string[] {
  return words.flatMap((word, index) =>
    filesHolding(word, where).map((file) => `${file} (private word ${index + 1})`),
  );
}

function findingsFor(words: readonly string[], argv: readonly string[]): string[] {
  const messageFile = argv.includes(MESSAGE_OPTION)
    ? argv[argv.indexOf(MESSAGE_OPTION) + 1]
    : undefined;
  const where = argv.includes(STAGED_OPTION) ? '--cached' : '--untracked';
  return messageFile === undefined
    ? fileFindings(words, where)
    : messageFindings(words, messageFile);
}

const words = localSampleEntries().flatMap((entry) => entry.privateTokens);
const findings = findingsFor(words, process.argv.slice(2));
if (findings.length > 0) {
  process.stderr.write(
    `Words of a private recording, which must stay local (ADR 0031):\n${findings.join('\n')}\n`,
  );
  process.exitCode = 1;
}
