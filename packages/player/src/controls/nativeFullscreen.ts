/**
 * Takes `target` into the Fullscreen API's fullscreen, or out of it, where the browser offers it:
 * iPhone Safari has none for anything but a video, and an iframe without the permission none at
 * all. A refusal leaves the target as it was.
 */
export async function toggleNativeFullscreen(target: HTMLElement): Promise<void> {
  if (target.matches(':fullscreen')) {
    await leaveNativeFullscreen();
    return;
  }
  if (!document.fullscreenEnabled) return;
  try {
    await target.requestFullscreen();
  } catch {
    // Refused (no gesture, a permission policy): the target stays as it was.
  }
}

/**
 * The document may have left fullscreen already, its own Escape racing the page's: then there is
 * nothing to leave, which is all the browser's refusal says.
 */
export async function leaveNativeFullscreen(): Promise<void> {
  try {
    await document.exitFullscreen();
  } catch {
    // Out of fullscreen already.
  }
}
