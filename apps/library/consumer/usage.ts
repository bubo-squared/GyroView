// What a page written in TypeScript does with the package, checked against the built types by
// tsconfig.consumer.json: they must stand alone, naming nothing that stayed in the monorepo.
import 'gyroview/define';
import {
  createBrowserPlayer,
  GyroViewError,
  hasErrorCode,
  inspectRecording,
  VIEW_MODES,
  type GyroViewErrorCode,
  type PlayerMetadata,
  type PlayerStatus,
  type RecordingInspection,
  type ViewMode,
} from 'gyroview';

const element = document.createElement('gyro-view');
element.src = 'https://media.example/VID_20260814_132640_00_013.insv';
element.stabilization = 'horizon';
element.fov = 90;
document.body.append(element);

const status: PlayerStatus = element.status;
const metadata: PlayerMetadata | undefined = element.metadata;
const panorama: ViewMode = VIEW_MODES[1] ?? 'normal';
element.setViewMode(panorama);
element.loadFiles({ main: new File([], 'VID_20260814_132640_00_013.insv') });

const found = document.querySelector('gyro-view');
found?.lookAt(90, 0);

element.addEventListener('ready', (event) => {
  const model: string | undefined = event.detail.model;
  return model;
});
element.addEventListener('error', (event) => {
  const code: GyroViewErrorCode = event.detail.code;
  return code;
});
element.addEventListener('timeupdate', (event) => event.detail.toFixed(1));
element.addEventListener('click', (event) => event.clientX);

const inspected: RecordingInspection = await inspectRecording(new File([], 'clip.insv'));
const fromUrl = await inspectRecording('https://media.example/clip.insv', {
  signal: AbortSignal.timeout(10_000),
});
const samples = inspected.gyro && 'samples' in inspected.gyro ? inspected.gyro.samples : 0;

try {
  await element.load();
} catch (error) {
  if (error instanceof GyroViewError && hasErrorCode(error, 'cors')) element.remove();
}

const player = createBrowserPlayer({
  canvas: document.createElement('canvas'),
  audio: document.createElement('audio'),
});
player.events.on('ready', (ready) => ready.model);

export { fromUrl, metadata, samples, status };
