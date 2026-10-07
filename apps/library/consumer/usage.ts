// What a page written in TypeScript does with the package, checked against the built types by
// tsconfig.consumer.json: they must stand alone, naming nothing that stayed in the monorepo.
import '@bubo-squared/gyroview/define';
import {
  attachKeyboard,
  attachViewGestures,
  createBrowserPlayer,
  GYRO_VIEW_ERROR_CATEGORIES,
  GYRO_VIEW_ERROR_CODES,
  GyroViewError,
  hasErrorCode,
  inspectRecording,
  isGyroViewErrorCode,
  PICTURE_QUALITIES,
  VIEW_MODES,
  type GyroViewErrorCategory,
  type GyroViewErrorCode,
  type MotionLookState,
  type PictureQuality,
  type PlayerMetadata,
  type PlayerStatus,
  type RecordingFetch,
  type RecordingInspection,
  type ViewMode,
  type WarningCode,
} from '@bubo-squared/gyroview';

const element = document.createElement('gyro-view');
element.src = 'https://media.example/VID_20260814_132640_00_013.insv';
element.stabilization = 'horizon';
element.fov = 90;
document.body.append(element);

const status: PlayerStatus = element.status;
const metadata: PlayerMetadata | undefined = element.metadata;
const panorama: ViewMode = VIEW_MODES[1] ?? 'normal';
element.setViewMode(panorama);
const sharpest: PictureQuality = PICTURE_QUALITIES.at(-1) ?? 'balanced';
element.setQuality(sharpest);
element.addEventListener('qualitychange', (event) => {
  const quality: PictureQuality = event.detail;
  return quality;
});
element.loadFiles({ main: new File([], 'VID_20260814_132640_00_013.insv') });
element.addEventListener('motionlookchange', (event) => {
  const motion: MotionLookState = event.detail;
  return motion;
});
document.querySelector('button')?.addEventListener('click', () => {
  if (element.motionLook === 'on') element.stopMotionLook();
  else void element.startMotionLook();
});

const found = document.querySelector('gyro-view');
found?.lookAt(90, 0);

element.addEventListener('ready', (event) => {
  const model: string | undefined = event.detail.model;
  return model;
});
element.addEventListener('error', (event) => {
  const code: GyroViewErrorCode = event.detail.code;
  const category: GyroViewErrorCategory = event.detail.category;
  return category === 'browser' ? code : undefined;
});
const knownCategories: readonly GyroViewErrorCategory[] = GYRO_VIEW_ERROR_CATEGORIES;
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
const detachGestures = attachViewGestures(document.createElement('canvas'), player);
const detachKeyboard = attachKeyboard(document.body, player, { toggleFullscreen: () => undefined });
detachGestures();
detachKeyboard();
await player.load({ main: { url: 'https://media.example/VID_20260814_132640_00_013.insv' } });
await player.load({
  main: { url: 'https://files.example/VID_20260814_132640_00_013.insv', credentials: 'include' },
});
player.seek(12.5);
player.lookAt(90, -10);
player.turn(5, 0);
player.setView({ ...player.view, fieldOfView: 75 });
const position: number = player.currentTime;
const yaw: number = player.view.yaw;
element.preload = 'none';
element.crossOrigin = 'use-credentials';
const reading: 'anonymous' | 'use-credentials' | null = element.crossOrigin;
const withToken: RecordingFetch = (url, init) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer token');
  return fetch(url, { ...init, headers });
};
element.fetch = withToken;
element.fetch = null;
await player.load({
  main: { url: 'https://api.example/files/recording?alt=media', fetch: withToken },
});
const matching: 'on' | 'off' = element.gainMatch;
const knownCodes: readonly GyroViewErrorCode[] = GYRO_VIEW_ERROR_CODES;
const fromMessage = isGyroViewErrorCode('cors') ? 'cors' : undefined;

export {
  playLabel,
  fromMessage,
  fromUrl,
  knownCategories,
  knownCodes,
  matching,
  metadata,
  position,
  reading,
  samples,
  status,
  yaw,
};
