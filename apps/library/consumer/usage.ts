// What a page written in TypeScript does with the package, checked against the built types by
// tsconfig.consumer.json: they must stand alone, naming nothing that stayed in the monorepo.
import 'gyroview/define';
import {
  createBrowserPlayer,
  GYRO_VIEW_ERROR_CODES,
  GyroViewError,
  hasErrorCode,
  inspectRecording,
  isGyroViewErrorCode,
  VIEW_MODES,
  type GyroViewErrorCode,
  type PlayerMetadata,
  type PlayerStatus,
  type RecordingInspection,
  type ViewMode,
  type WarningCode,
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
element.messages = { labels: { play: 'Lecture' }, errors: { cors: 'Introuvable.' } };
const playLabel: string = element.messages.labels.play;
element.messages = null;
element.addEventListener('warning', (event) => {
  const code: WarningCode = event.detail.code;
  return code === 'autoplay-blocked' ? event.detail.message : undefined;
});

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
await player.load({ main: { url: 'https://media.example/VID_20260814_132640_00_013.insv' } });
player.seek(12.5);
player.lookAt(90, -10);
player.turn(5, 0);
player.setView({ ...player.view, fieldOfView: 75 });
const position: number = player.currentTime;
const yaw: number = player.view.yaw;
element.preload = 'none';
const matching: 'on' | 'off' = element.gainMatch;
const knownCodes: readonly GyroViewErrorCode[] = GYRO_VIEW_ERROR_CODES;
const fromMessage = isGyroViewErrorCode('cors') ? 'cors' : undefined;

export {
  playLabel,
  fromMessage,
  fromUrl,
  knownCodes,
  matching,
  metadata,
  position,
  samples,
  status,
  yaw,
};
