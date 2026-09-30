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
import path from 'node:path';

import { localSampleEntries } from './localCatalogueFile.ts';
import type { LocalSampleEntry } from './localSampleCatalogue.ts';

const GREP_FOUND_NOTHING = 1;
const MESSAGE_OPTION = '--message';
const STAGED_OPTION = '--staged';

/**
 * Where the check looks: the files `git grep` searches, and the paths `git` lists.
 */
interface Scope {
  readonly grepArgument: string;
  readonly pathArguments: readonly string[];
}

const WORKING_TREE: Scope = {
  grepArgument: '--untracked',
  pathArguments: ['ls-files', '--cached', '--others', '--exclude-standard'],
};

const STAGED: Scope = { grepArgument: '--cached', pathArguments: ['ls-files', '--cached'] };

/**
 * A recording's private words: those its entry lists, and its file name with and without its
 * extension, so that a name left off the list still counts.
 */
function privateWordsOf(entry: LocalSampleEntry): string[] {
  return [...entry.privateTokens, entry.recording, path.parse(entry.recording).name];
}

/**
 * The files holding `word` in any case, as `git grep` finds them in the scope.
 */
function filesHolding(word: string, scope: Scope): string[] {
  try {
    const output = execFileSync('git', ['grep', scope.grepArgument, '-l', '-i', '-F', '-e', word], {
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

function fileFindings(words: readonly string[], scope: Scope): string[] {
  return words.flatMap((word, index) =>
    filesHolding(word, scope).map((file) => `${file} (private word ${index + 1})`),
  );
}

/**
 * The words some file's path holds: the path itself is not shown, since it holds the word.
 */
function pathFindings(words: readonly string[], scope: Scope): string[] {
  const paths = execFileSync('git', scope.pathArguments, { encoding: 'utf8' }).toLowerCase();
  return words.flatMap((word, index) =>
    paths.includes(word.toLowerCase()) ? [`a file's path (private word ${index + 1})`] : [],
  );
}

function findingsFor(words: readonly string[], argv: readonly string[]): string[] {
  const messageFile = argv.includes(MESSAGE_OPTION)
    ? argv[argv.indexOf(MESSAGE_OPTION) + 1]
    : undefined;
  const scope = argv.includes(STAGED_OPTION) ? STAGED : WORKING_TREE;
  return messageFile === undefined
    ? [...fileFindings(words, scope), ...pathFindings(words, scope)]
    : messageFindings(words, messageFile);
}

const words = [...new Set(localSampleEntries().flatMap((entry) => privateWordsOf(entry)))];
const findings = findingsFor(words, process.argv.slice(2));
if (findings.length > 0) {
  process.stderr.write(
    `Words of a private recording, which must stay local (ADR 0031):\n${findings.join('\n')}\n`,
  );
  process.exitCode = 1;
}
