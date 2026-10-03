import { existsSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineProject, type UserWorkspaceConfig } from 'vitest/config';
import type { Browser } from 'playwright';
import type { BrowserCommandContext } from 'vitest/node';

import { AUTOPLAY_WITHOUT_GESTURE, chromiumArguments } from '../../test/browserLaunch.mjs';
import { localSampleEntries, realFolderOf, servedLocalSample } from './src/localCatalogueFile.ts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ARTIFACTS = path.join(REPOSITORY_ROOT, '.artifacts');
/**
 * Where the tests fetch the frames of the Studio exports from: Vite serves a file outside the
 * project's root under `/@fs/` and its absolute path.
 */
const REFERENCE_FOLDER_URL = `/@fs${pathToFileURL(path.join(ARTIFACTS, 'reference')).pathname}/`;
const DATA_URL_PAYLOAD = /^data:[^,]*;base64,(?<payload>.+)$/su;

/**
 * Browser command: stores a rendered image or a measurement from a test for inspection.
 * `.artifacts/` is git-ignored.
 */
async function saveArtifact(_context: unknown, name: string, dataUrl: string): Promise<string> {
  const payload = DATA_URL_PAYLOAD.exec(dataUrl)?.groups?.['payload'];
  if (payload === undefined) throw new Error('saveArtifact expects a base64 data URL');
  await mkdir(ARTIFACTS, { recursive: true });
  const target = path.join(ARTIFACTS, path.basename(name));
  await writeFile(target, Buffer.from(payload, 'base64'));
  return target;
}
/**
 * Chrome's own account of its frames, as DevTools' performance panel shows them: each
 * `PipelineReporter` slice ends in a state, presented or dropped.
 */
const FRAME_TRACE_CATEGORIES = [
  'benchmark',
  'graphics.pipeline',
  'disabled-by-default-devtools.timeline.frame',
];

/**
 * The browser behind the test's page; only Chromium can trace.
 */
function browserOf(context: BrowserCommandContext): Browser {
  const browser = context.context.browser();
  if (!browser) throw new Error('the test page has no browser to trace');
  return browser;
}

async function startFrameTrace(context: BrowserCommandContext): Promise<void> {
  await browserOf(context).startTracing(context.page, { categories: FRAME_TRACE_CATEGORIES });
}

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly dur?: number;
  readonly args?: Record<string, unknown>;
}

/**
 * Stops the trace, writes it whole to `.artifacts/<name>` and returns its frame events.
 */
async function stopFrameTrace(context: BrowserCommandContext, name: string): Promise<TraceEvent[]> {
  const buffer = await browserOf(context).stopTracing();
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(path.join(ARTIFACTS, path.basename(name)), buffer);
  const trace = JSON.parse(buffer.toString('utf8')) as { traceEvents: TraceEvent[] };
  return trace.traceEvents.filter((event) => event.name === 'PipelineReporter');
}

const SAMPLE_FOLDERS = ['office', 'sailing', 'krnjaca-c2'].map((name) =>
  fileURLToPath(new URL(`../../samples/${name}`, import.meta.url)),
);

/**
 * `samples/*` are symlinks to folders outside the repository; Vite serves a file only when its
 * real path is allowed, so the targets that exist are added explicitly.
 */
const sampleTargets = SAMPLE_FOLDERS.filter((folder) => existsSync(folder)).map((folder) =>
  realpathSync(folder),
);
/**
 * The recordings only this machine has, from the git-ignored catalogue (ADR 0031), and the
 * folders Vite serves: the repository's, and the real folders of every sample.
 */
const localSamples = localSampleEntries();
const SERVED_FOLDERS = [
  REPOSITORY_ROOT,
  ...sampleTargets,
  ...localSamples.map((entry) => realFolderOf(entry)),
];

/**
 * Playwright's own Chromium build has no HEVC decoder; the installed Google Chrome does. The
 * end-to-end tests drive Chrome when it is present and fall back to Chromium (where the
 * HEVC-dependent tests skip themselves).
 */
const CHROME_APP = '/Applications/Google Chrome.app';
const chromiumLaunch = {
  args: chromiumArguments(AUTOPLAY_WITHOUT_GESTURE),
  ...(existsSync(CHROME_APP) && { channel: 'chrome' }),
};

/**
 * `GYROVIEW_HEADED=1` shows the browsers: frame pacing depends on a real display, which a
 * headless browser does not have.
 */
const IS_HEADED = process.env['GYROVIEW_HEADED'] === '1';

export interface BrowserProjectOptions {
  readonly name: string;
  readonly include: string[];
  /**
   * Whether the tests write their renders and measurements to `.artifacts/` for inspection.
   */
  readonly savesArtifacts: boolean;
}

/**
 * Tests of the browser pipeline (HTTP ranges, the download, WebCodecs, the audio clock, WebGL)
 * against the real recordings, served by Vite's dev server with Range support. A test whose
 * sample is absent skips itself; without any samples, as in CI, the project is not run at all.
 */
export function browserProject(options: BrowserProjectOptions): UserWorkspaceConfig {
  return defineProject({
    server: { fs: { allow: SERVED_FOLDERS } },
    test: {
      name: options.name,
      include: options.include,
      provide: {
        savesArtifacts: options.savesArtifacts,
        referenceFolder: REFERENCE_FOLDER_URL,
        localSamples: localSamples.map((entry) => servedLocalSample(entry)),
      },
      testTimeout: 90_000,
      hookTimeout: 90_000,
      /**
       * The suites share the machine's few hardware HEVC decoders; running them at once starves
       * the playback test of frames.
       */
      fileParallelism: false,
      browser: {
        enabled: true,
        headless: !IS_HEADED,
        provider: playwright(),
        commands: { saveArtifact, startFrameTrace, stopFrameTrace },
        instances: [
          {
            browser: 'chromium',
            provider: playwright({ launchOptions: chromiumLaunch }),
          },
          { browser: 'webkit' },
        ],
      },
    },
  });
}
