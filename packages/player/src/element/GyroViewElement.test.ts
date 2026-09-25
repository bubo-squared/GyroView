import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineGyroView } from './defineGyroView';
import type { GyroViewElement } from './GyroViewElement';
import { queryShadow } from '../controls/controlParts';
import { fetchBytes, X5_RECORDING_URL } from '../test/recordings';

const WAIT_MS = 15_000;
const POLL_MS = 20;

beforeAll(() => {
  defineGyroView();
});

function nextEvent<Detail>(target: EventTarget, name: string): Promise<Detail> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no ${name} event within ${WAIT_MS} ms`));
    }, WAIT_MS);
    target.addEventListener(
      name,
      (event) => {
        clearTimeout(timer);
        resolve((event as CustomEvent<Detail>).detail);
      },
      { once: true },
    );
  });
}

async function waitFor(isSatisfied: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + WAIT_MS;
  while (!isSatisfied()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
}

function shadowOf(element: GyroViewElement): ShadowRoot {
  const { shadowRoot } = element;
  if (!shadowRoot) throw new Error('the element has no shadow root');
  return shadowRoot;
}

function control<Found extends Element>(
  element: GyroViewElement,
  selector: string,
  kind: new () => Found,
): Found {
  return queryShadow(shadowOf(element), selector, kind);
}

function pointer(type: string, at: { x: number; y: number }): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    clientX: at.x,
    clientY: at.y,
    bubbles: true,
    isPrimary: true,
  });
}

describe('<gyro-view>', () => {
  const elements: GyroViewElement[] = [];

  function create(attributes: Record<string, string> = {}): GyroViewElement {
    const element = document.createElement('gyro-view') as GyroViewElement;
    element.style.width = '256px';
    element.style.height = '128px';
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    document.body.append(element);
    elements.push(element);
    return element;
  }

  async function createReady(attributes: Record<string, string> = {}): Promise<GyroViewElement> {
    const element = create({ controls: '', ...attributes });
    const ready = nextEvent(element, 'ready');
    element.src = X5_RECORDING_URL;
    await ready;
    return element;
  }

  afterEach(() => {
    for (const element of elements.splice(0)) element.remove();
  });

  it('loads what src names, reflects attributes as properties and exposes the metadata', async () => {
    const element = create({ controls: '', yaw: '20', stabilization: 'horizon', muted: '' });
    const ready = nextEvent<{ model: string }>(element, 'ready');
    element.src = X5_RECORDING_URL;

    const metadata = await ready;

    expect(metadata.model).toBe('Insta360 X5');
    expect(element.metadata?.layout).toBe('multi-track');
    expect(element.status).toBe('ready');
    expect(element.dataset['status']).toBe('ready');
    expect(element.src).toBe(X5_RECORDING_URL);
    expect(element.yaw).toBe(20);
    expect(element.view.yaw).toBe(20);
    expect(element.stabilization).toBe('horizon');
    expect(element.muted).toBe(true);
    expect(element.controls).toBe(true);
    expect(element.duration).toBeCloseTo(3, 1);
    expect(element.paused).toBe(true);
    expect(element.tabIndex).toBe(0);
  });

  it('has labelled controls that drive playback and hide without the controls attribute', async () => {
    const element = await createReady();
    const play = control(element, '.play', HTMLButtonElement);
    const controls = control(element, '.controls', HTMLElement);
    expect(play.getAttribute('aria-label')).toBe('Play');
    expect(getComputedStyle(controls).display).not.toBe('none');

    const playing = nextEvent(element, 'play');
    play.click();
    await playing;
    expect(element.paused).toBe(false);
    expect(play.getAttribute('aria-label')).toBe('Pause');
    await nextEvent(element, 'frame');
    expect(element.dataset['hasFrame']).toBe('');

    const paused = nextEvent(element, 'pause');
    play.click();
    await paused;
    expect(element.status).toBe('paused');

    element.controls = false;
    expect(getComputedStyle(controls).display).toBe('none');
  });

  it('answers keyboard shortcuts on the element', async () => {
    const element = await createReady();
    const key = (name: string, isShiftPressed = false): void => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, shiftKey: isShiftPressed, bubbles: true }),
      );
    };

    const playing = nextEvent(element, 'play');
    key(' ');
    await playing;
    key('k');
    await waitFor(() => element.paused, 'pause by keyboard');

    key('m');
    expect(element.muted).toBe(false);
    key('ArrowRight');
    expect(element.view.yaw).toBe(5);
    key('-');
    expect(element.view.fieldOfView).toBeGreaterThan(90);
    key('0');
    expect(element.view).toMatchObject({ yaw: 0, pitch: 0, fieldOfView: 90 });
    key('ArrowRight', true);
    await waitFor(() => element.currentTime >= 3, 'a clamped seek to the end');
  });

  it('looks around with drags and wheel turns on the canvas, and toggles play on a tap', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    const views: number[] = [];
    element.addEventListener('viewchange', (event) => {
      views.push((event as CustomEvent<{ yaw: number }>).detail.yaw);
    });

    canvas.dispatchEvent(pointer('pointerdown', { x: 100, y: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 164, y: 50 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 164, y: 50 }));
    // 64 px of a 256 px wide 90-degree view: a quarter of the field, dragged right turns left.
    expect(views).toEqual([-22.5]);

    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    );
    expect(element.view.fieldOfView).toBeCloseTo(90 / 1.1, 6);

    const playing = nextEvent(element, 'play');
    canvas.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 11, y: 10 }));
    await playing;
  });

  it('applies view and playback attributes without reloading', async () => {
    const element = await createReady();
    const readies: number[] = [];
    element.addEventListener('ready', () => {
      readies.push(1);
    });

    element.setAttribute('pitch', '15');
    element.fov = 60;
    expect(element.view).toMatchObject({ pitch: 15, fieldOfView: 60 });

    const modeChanged = nextEvent<string>(element, 'viewmodechange');
    element.setViewMode('equirectangular');
    expect(await modeChanged).toBe('equirectangular');
    expect(element.viewMode).toBe('equirectangular');
    expect(control(element, '.view-mode', HTMLSelectElement).value).toBe('equirectangular');
    element.setAttribute('view-mode', 'bogus');
    expect(control(element, '.view-mode', HTMLSelectElement).value).toBe('equirectangular');
    const options = control(element, '.view-mode', HTMLSelectElement).options;
    expect([...options].map((option) => option.value)).toEqual([
      'normal',
      'equirectangular',
      'raw-lenses',
    ]);

    const changed = nextEvent<string>(element, 'stabilizationchange');
    element.setStabilization('off');
    expect(await changed).toBe('off');
    expect(control(element, '.stabilization', HTMLSelectElement).value).toBe('off');

    element.loop = true;
    element.poster = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    expect(control(element, '.poster', HTMLImageElement).src).toContain('data:image/gif');
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(readies).toEqual([]);
  });

  it('shows an error overlay for a source it cannot read and recovers on a new src', async () => {
    const element = create({ controls: '' });
    const failed = nextEvent<{ code: string }>(element, 'error');
    element.src = `${X5_RECORDING_URL}.missing`;

    const error = await failed;

    expect(error.code).toBe('source-unreadable');
    expect(element.dataset['status']).toBe('error');
    expect(control(element, '.error-code', HTMLElement).textContent).toBe('source-unreadable');
    expect(getComputedStyle(control(element, '.overlay.error', HTMLElement)).display).toBe('flex');

    const ready = nextEvent(element, 'ready');
    element.src = X5_RECORDING_URL;
    await ready;
    expect(element.dataset['status']).toBe('ready');

    element.src = null;
    await waitFor(() => element.status === 'idle', 'unloading');
  });

  it('plays local files handed to it', async () => {
    const element = create({ controls: '' });
    const bytes = await fetchBytes(X5_RECORDING_URL);
    const ready = nextEvent(element, 'ready');

    element.loadFiles({ main: new File([bytes], 'VID_20260814_132640_00_013.insv') });

    await ready;
    expect(element.metadata?.model).toBe('Insta360 X5');
  });

  it('fills the screen one way or another and leaves on Escape', async () => {
    const element = await createReady();

    await element.toggleFullscreen();
    const isFilling =
      document.fullscreenElement === element || element.dataset['fill'] !== undefined;
    expect(isFilling).toBe(true);

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(
      () => document.fullscreenElement !== element && element.dataset['fill'] === undefined,
      'leaving fullscreen',
    );
  });

  it('unloads when removed from the document', async () => {
    const element = await createReady();
    element.remove();
    expect(element.status).toBe('idle');
  });
});
