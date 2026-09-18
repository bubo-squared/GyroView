// Data point: does a plain <video> element accept the .insv (trailer and all) and start playing?

export interface VideoElementResult {
  metadataLoaded: boolean;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  advancedAfterPlay: boolean;
  error: string | null;
}

const TIMEOUT_MS = 8000;
const PLAY_OBSERVATION_MS = 1500;

export async function testVideoElement(url: string): Promise<VideoElementResult> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'metadata';
  video.style.display = 'none';
  document.body.append(video);
  try {
    video.src = url;
    const metadataLoaded = await waitForMetadata(video);
    let advancedAfterPlay = false;
    if (metadataLoaded) {
      await video.play().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, PLAY_OBSERVATION_MS));
      advancedAfterPlay = video.currentTime > 0;
      video.pause();
    }
    return {
      metadataLoaded,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      duration: video.duration,
      advancedAfterPlay,
      error: video.error ? `code ${video.error.code}: ${video.error.message}` : null,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    video.addEventListener('loadedmetadata', () => (clearTimeout(timer), resolve(true)), { once: true });
    video.addEventListener('error', () => (clearTimeout(timer), resolve(false)), { once: true });
  });
}
