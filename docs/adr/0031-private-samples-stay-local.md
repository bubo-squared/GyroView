# ADR 0031: A recording shared privately stays local; the tests learn it from a git-ignored catalogue

Status: accepted (2026-09-30)

## Context

The only X6 recording the project has was shared by its owner on the condition that it goes no
further. The repository is public, and so are its issues. Every earlier sample was the
maintainers' own: its file name is spelled in `tools/integration/src/browser/sampleUrls.ts`,
byte slices of its trailer are committed as fixtures (`test/fixtures/x5`, the serial number
replaced), and ADRs quote its calibration values. None of that may happen with a recording like
this one. Its info record alone holds the serial number and the unit's own calibration.

## Decision

- **A private recording is described in `samples/catalogue.json`**, which is git-ignored with
  the symlinks beside it: its folder and file, frame rate and coded size, the moments the
  tests render and rank at, the frames of its Studio export, and its `privateTokens`, the
  words of it that must never enter the repository (its file name, its serial).
- **The tests pick it up from there.** `tools/integration/src/localCatalogueFile.ts` reads the
  catalogue on the Node side; the browser project serves its folders and hands the entries to
  the browser tests (`LOCAL_SAMPLES`). Local samples are rendered and measured
  (`measure/localRecordings.test.ts`, the IMU frame ranking, the Studio clips) and read end to
  end, and every test checks only what any playable recording must have.
- **Nothing of it is committed.** Unit tests of its camera use synthetic fixtures with invented
  values; the format documentation describes structure only; ADRs report measurements on it as
  aggregates (a chosen scale, a seam median), never its calibration values.
- **`pnpm privacy:check` enforces it** (`test/checkPrivateSamples.mjs`): the private words may
  not appear in tracked or new files (part of `pnpm verify`), in what a commit stages (the
  pre-commit hook), or in a commit message (the commit-msg hook). Without a catalogue, as in CI,
  there is nothing to check.

## Alternatives considered

- Committing video-stripped trailer slices, as for the X5: the trailer is what must stay
  private.
- An environment variable naming the file: it keeps the name out of the repository but
  nothing else a test needs, and nothing checks a slip.
- Scrubbing the serial and the calibration from a slice: the calibration is the unit's; what is
  left says little that a synthetic fixture does not.

## Consequences

- A test run on a machine without the catalogue skips the local samples, as it skips the X5
  samples without the symlinks.
- A camera measured only on a private recording has its decisions recorded as aggregates, and
  marked provisional until a recording that can be shared confirms them.
