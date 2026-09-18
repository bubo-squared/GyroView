// Phase 0 spike runner: starts the sample server and Vite, drives the spike page in
// Google Chrome (installed channel, hardware decoding) and WebKit, prints the results.
// Throwaway code.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, webkit } from '@playwright/test';

const SAMPLE_SERVER = 'http://localhost:8787';
const VITE_SERVER = 'http://localhost:5173';
const SECONDS = process.env.SECONDS ?? '10';
const FILES = (process.env.FILES ?? 'office/VID_20260814_132640_00_013.insv,sailing/VID_20260918_082915_00_014.insv').split(',');
const ENGINES = (process.env.ENGINES ?? 'chrome,webkit').split(',');

function startProcess(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'], cwd: import.meta.dirname });
  child.stdout.on('data', (chunk) => process.stderr.write(`[${command}] ${chunk}`));
  return child;
}

async function waitForServer(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok || response.status === 404) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`server at ${url} did not come up`);
}

async function launch(engine) {
  if (engine === 'chrome') return chromium.launch({ channel: 'chrome', headless: false });
  if (engine === 'webkit') return webkit.launch({ headless: false });
  throw new Error(`unknown engine ${engine}`);
}

async function measure(engine, file) {
  const browser = await launch(engine);
  const page = await browser.newPage();
  page.on('console', (message) => process.stderr.write(`  [${engine}:console] ${message.text()}\n`));
  page.on('pageerror', (error) => process.stderr.write(`  [${engine}:pageerror] ${error.message}\n`));
  const url = `${VITE_SERVER}/?src=${encodeURIComponent(`${SAMPLE_SERVER}/${file}`)}&seconds=${SECONDS}`;
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__spikeResults?.done === true, null, { timeout: 180_000 });
  const results = await page.evaluate(() => globalThis.__spikeResults);
  await browser.close();
  return results;
}

const servers = [startProcess('node', ['serve-samples.mjs']), startProcess('pnpm', ['exec', 'vite', '--port', '5173', '--strictPort'])];
try {
  await waitForServer(`${SAMPLE_SERVER}/`);
  await waitForServer(`${VITE_SERVER}/`);
  const report = {};
  for (const engine of ENGINES) {
    for (const file of FILES) {
      process.stderr.write(`\n=== ${engine} / ${file} ===\n`);
      try {
        report[`${engine} ${file}`] = await measure(engine, file);
      } catch (error) {
        report[`${engine} ${file}`] = { error: String(error) };
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const server of servers) server.kill();
}
