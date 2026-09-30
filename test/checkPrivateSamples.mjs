/**
 * Refuses words of a private recording (ADR 0031): the file names, serials and other words that
 * `samples/catalogue.json` lists as private, which must never reach the public repository.
 *
 *   node test/checkPrivateSamples.mjs             tracked and new files of the working tree
 *   node test/checkPrivateSamples.mjs --staged    what the next commit holds
 *   node test/checkPrivateSamples.mjs --message <file>   a commit message
 *
 * Without a catalogue, as in CI, there is nothing to look for.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const CATALOGUE = new URL('../samples/catalogue.json', import.meta.url);
const GREP_FOUND_NOTHING = 1;

function privateWords() {
  if (!existsSync(CATALOGUE)) return [];
  const { samples } = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  return samples.flatMap((sample) => sample.privateTokens);
}

/**
 * The files holding `word`, as `git grep` finds them in the working tree or the index.
 */
function filesHolding(word, where) {
  try {
    const output = execFileSync('git', ['grep', ...where, '-l', '-F', '-e', word], {
      encoding: 'utf8',
    });
    return output.split('\n').filter((line) => line !== '');
  } catch (error) {
    if (error.status === GREP_FOUND_NOTHING) return [];
    throw error;
  }
}

function findingsIn(words, argv) {
  const messageIndex = argv.indexOf('--message');
  if (messageIndex !== -1) {
    const message = readFileSync(argv[messageIndex + 1], 'utf8');
    return words.flatMap((word, index) =>
      message.includes(word) ? [`the commit message (private word ${index + 1})`] : [],
    );
  }
  const where = argv.includes('--staged') ? ['--cached'] : ['--untracked'];
  return words.flatMap((word, index) =>
    filesHolding(word, where).map((file) => `${file} (private word ${index + 1})`),
  );
}

const findings = findingsIn(privateWords(), process.argv.slice(2));
if (findings.length > 0) {
  process.stderr.write(
    `Words of a private recording, which must stay local (ADR 0031):\n${findings.join('\n')}\n`,
  );
  process.exitCode = 1;
}
