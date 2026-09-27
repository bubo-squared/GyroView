import {
  defineGyroView,
  GYRO_VIEW_TAG,
  type GyroViewElement,
  type PlayerMetadata,
} from '@gyroview/player';

import { FpsCounter } from './FpsCounter';
import { sampleRecordingsOf, type SampleRecording } from './sampleRecordings';
import { SAMPLES_ENDPOINT, type SampleFolderListing } from './samplesListing';
import { embedUrlFor, FRAME_PERMISSIONS } from '../bridge/embedUrl';

interface DevelopmentPageParts {
  readonly player: GyroViewElement;
  readonly urlForm: HTMLFormElement;
  readonly fileForm: HTMLFormElement;
  readonly samples: HTMLElement;
  readonly status: HTMLElement;
  readonly metadata: HTMLElement;
  readonly warnings: HTMLElement;
  readonly snippet: HTMLElement;
  readonly embedLink: HTMLAnchorElement;
}

const STATUS_INTERVAL_MS = 250;
const JSON_INDENT = 2;

function detailOf(event: Event): unknown {
  if (!(event instanceof CustomEvent)) throw new Error(`${event.type} carries no detail`);
  return event.detail as unknown;
}

function part<Found extends Element>(selector: string, kind: new () => Found): Found {
  const element = document.querySelector(selector);
  if (!(element instanceof kind)) throw new Error(`the dev page lacks ${selector}`);
  return element;
}

function fieldOf(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function fileOf(form: HTMLFormElement, name: string): File | undefined {
  const value = new FormData(form).get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/**
 * The developer page: load a URL or local files into a `<gyro-view>` and watch what it reports.
 */
export function startDevelopmentPage(): void {
  defineGyroView();
  const parts: DevelopmentPageParts = {
    player: part(GYRO_VIEW_TAG, HTMLElement) as GyroViewElement,
    urlForm: part('form.url-source', HTMLFormElement),
    fileForm: part('form.file-source', HTMLFormElement),
    samples: part('.samples', HTMLElement),
    status: part('.status', HTMLElement),
    metadata: part('.metadata', HTMLElement),
    warnings: part('.warnings', HTMLElement),
    snippet: part('.snippet', HTMLElement),
    embedLink: part('a.embed-link', HTMLAnchorElement),
  };
  bindUrlForm(parts);
  bindFileForm(parts);
  bindDebugPanel(parts);
  void listSamples(parts);
}

function bindUrlForm(parts: DevelopmentPageParts): void {
  parts.urlForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadUrl(parts, fieldOf(parts.urlForm, 'url'));
  });
}

function loadUrl(parts: DevelopmentPageParts, url: string): void {
  const { player, urlForm } = parts;
  const second = fieldOf(urlForm, 'url2');
  player.src2 = second === '' ? null : second;
  player.src = url === '' ? null : url;
  showEmbedding(parts, url);
}

function bindFileForm(parts: DevelopmentPageParts): void {
  parts.fileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const main = fileOf(parts.fileForm, 'main');
    if (!main) return;
    const second = fileOf(parts.fileForm, 'second');
    parts.player.loadFiles({ main, ...(second && { second }) });
  });
}

function bindDebugPanel(parts: DevelopmentPageParts): void {
  const { player } = parts;
  const fps = new FpsCounter();
  player.addEventListener('frame', () => {
    fps.record(performance.now());
  });
  // A load's warnings come just before its ready: the list is cleared when the load begins.
  player.addEventListener('statuschange', (event) => {
    if (detailOf(event) === 'loading') parts.warnings.replaceChildren();
  });
  player.addEventListener('ready', (event) => {
    const metadata = detailOf(event) as PlayerMetadata;
    parts.metadata.textContent = JSON.stringify(metadata, undefined, JSON_INDENT);
  });
  player.addEventListener('warning', (event) => {
    appendLine(parts.warnings, `warning: ${detailOf(event) as string}`);
  });
  player.addEventListener('error', (event) => {
    const error = detailOf(event) as { code: string; message: string };
    appendLine(parts.warnings, `error ${error.code}: ${error.message}`);
  });
  setInterval(() => {
    showStatus(parts, fps.rateAt(performance.now()));
  }, STATUS_INTERVAL_MS);
}

function showStatus(parts: DevelopmentPageParts, fps: number): void {
  const { player } = parts;
  const view = player.view;
  parts.status.textContent = [
    `status: ${player.status}`,
    `time: ${player.currentTime.toFixed(2)} / ${player.duration.toFixed(2)} s`,
    `fps: ${fps}`,
    `view: yaw ${view.yaw.toFixed(1)} pitch ${view.pitch.toFixed(1)} fov ${view.fieldOfView.toFixed(1)}`,
    `view mode: ${player.viewMode}`,
    `stabilization: ${player.stabilization}`,
  ].join('\n');
}

function appendLine(list: HTMLElement, text: string): void {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
}

async function listSamples(parts: DevelopmentPageParts): Promise<void> {
  try {
    const response = await fetch(SAMPLES_ENDPOINT);
    if (!response.ok) return;
    const listings = (await response.json()) as SampleFolderListing[];
    const items = sampleRecordingsOf(listings).map((sample) => sampleItem(parts, sample));
    parts.samples.replaceChildren(...items);
  } catch {
    // The samples endpoint exists only on the dev server; a built site simply lists nothing.
  }
}

function sampleItem(parts: DevelopmentPageParts, sample: SampleRecording): HTMLElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = sample.label;
  button.addEventListener('click', () => {
    const urlField = parts.urlForm.elements.namedItem('url');
    if (urlField instanceof HTMLInputElement) urlField.value = sample.url;
    loadUrl(parts, sample.url);
  });
  item.append(button);
  return item;
}

/**
 * The iframe snippet and link for the URL just loaded, so the embed path is one click away.
 */
function showEmbedding(parts: DevelopmentPageParts, url: string): void {
  if (url === '') return;
  const embedPage = new URL('embed.html', location.href).href;
  const embedUrl = embedUrlFor(embedPage, { src: url, muted: true }, location.origin);
  parts.embedLink.href = embedUrl;
  parts.snippet.textContent = [
    `<iframe src="${embedUrl}" allow="${FRAME_PERMISSIONS}" width="960" height="540"></iframe>`,
    '',
    `<script src="${new URL('embed.js', location.href).href}"></script>`,
    `<script>GyroView.embed(document.querySelector('#player'), { src: '${url}', muted: true });</script>`,
  ].join('\n');
}
