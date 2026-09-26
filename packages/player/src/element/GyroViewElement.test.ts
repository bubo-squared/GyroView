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

/**
 * The choices a menu offers, and the one it checks.
 */
function menuOf(element: GyroViewElement, name: string): { choices: string[]; checked: string[] } {
  const items = control(element, `.${name}-menu`, HTMLElement).querySelectorAll<HTMLElement>(
    ':scope [role="menuitemradio"]',
  );
  const choicesOf = (list: HTMLElement[]): string[] =>
    list.map((item) => item.dataset['choice'] ?? '');
  return {
    choices: choicesOf([...items]),
    checked: choicesOf([...items].filter((item) => item.getAttribute('aria-checked') === 'true')),
  };
}

/**
 * A press of the right mouse button at a horizontal position on the page.
 */
function secondaryButton(type: string, x: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 2,
    pointerType: 'mouse',
    button: 2,
    clientX: x,
    clientY: 50,
    bubbles: true,
  });
}

/**
 * A wheel notch toward the screen (zoom in) over a point of the canvas, given as fractions of it.
 */
function wheelOver(canvas: HTMLCanvasElement, at: { x: number; y: number }): void {
  const bounds = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY: -100,
      clientX: bounds.left + at.x * bounds.width,
      clientY: bounds.top + at.y * bounds.height,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * A key pressed on a control inside the shadow tree, as the browser dispatches it.
 */
function pressKey(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
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

  it('loads what src names and exposes the metadata', async () => {
    const element = create({ controls: '' });
    const ready = nextEvent<{ model: string }>(element, 'ready');
    element.src = X5_RECORDING_URL;

    const metadata = await ready;

    expect(metadata.model).toBe('Insta360 X5');
    expect(element.metadata?.layout).toBe('multi-track');
    expect(element.status).toBe('ready');
    expect(element.dataset['status']).toBe('ready');
    expect(element.duration).toBeCloseTo(3, 1);
    expect(element.paused).toBe(true);
  });

  it('applies the settings attributes it is created with', async () => {
    const element = await createReady({ yaw: '20', stabilization: 'horizon', muted: '' });
    expect(element.yaw).toBe(20);
    expect(element.view.yaw).toBe(20);
    expect(element.stabilization).toBe('horizon');
    expect(element.muted).toBe(true);
  });

  it('mirrors its source and presentation attributes as properties and takes focus', async () => {
    const element = await createReady();
    expect(element.src).toBe(X5_RECORDING_URL);
    expect(element.controls).toBe(true);
    expect(element.tabIndex).toBe(0);
  });

  it('has labelled controls that drive playback and hide without the controls attribute', async () => {
    const element = await createReady();
    const play = control(element, '.play', HTMLButtonElement);
    const controls = control(element, '.controls', HTMLElement);
    expect(play.getAttribute('aria-label')).toBe('Play');
    expect(getComputedStyle(controls).display).not.toBe('none');
    const stage = control(element, '.stage', HTMLElement);
    const buttons = stage.querySelectorAll(
      ':scope .big-play, :scope .row button:not([role="menuitemradio"])',
    );
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).not.toBeNull();
      expect(button.querySelectorAll('svg.icon')).toHaveLength(1);
      expect(button.textContent).toBe('');
    }

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

    const muted = nextEvent(element, 'volumechange');
    key('m');
    await muted;
    expect(element.muted).toBe(true);
    expect(control(element, '.mute', HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
    key('ArrowRight');
    expect(element.view.yaw).toBe(5);
    key('-');
    expect(element.view.fieldOfView).toBeGreaterThan(90);
    key('0');
    expect(element.view).toMatchObject({ yaw: 0, pitch: 0, fieldOfView: 90 });
    key('ArrowRight', true);
    await waitFor(() => element.currentTime >= 3, 'a clamped seek to the end');
  });

  it('leaves a focused slider its arrows and a focused button its Space', async () => {
    const element = await createReady();

    expect(
      pressKey(control(element, '.volume', HTMLInputElement), 'ArrowRight').defaultPrevented,
    ).toBe(false);
    expect(
      pressKey(control(element, '.seek', HTMLInputElement), 'ArrowLeft').defaultPrevented,
    ).toBe(false);
    expect(pressKey(control(element, '.mute', HTMLButtonElement), ' ').defaultPrevented).toBe(
      false,
    );
    expect(element.view.yaw).toBe(0);
    expect(element.paused).toBe(true);

    expect(pressKey(control(element, '.volume', HTMLInputElement), 'm').defaultPrevented).toBe(
      true,
    );
    expect(element.muted).toBe(true);
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

    wheelOver(canvas, { x: 0.5, y: 0.5 });
    expect(element.view.fieldOfView).toBeCloseTo(90 / 1.1, 6);

    const playing = nextEvent(element, 'play');
    canvas.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 11, y: 10 }));
    await playing;
  });

  it('takes neither a drag nor a tap from another mouse button, nor a tap from a cancelled press', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    canvas.dispatchEvent(secondaryButton('pointerdown', 100));
    canvas.dispatchEvent(secondaryButton('pointermove', 160));
    canvas.dispatchEvent(secondaryButton('pointerup', 160));
    canvas.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    canvas.dispatchEvent(pointer('pointercancel', { x: 10, y: 10 }));
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(element.view.yaw).toBe(0);
    expect(element.status).toBe('ready');
  });

  it('zooms a pinch toward the point between the fingers', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    // Synthetic touches are no active pointers, so the browser would refuse to capture them.
    canvas.setPointerCapture = (): void => undefined;
    const bounds = canvas.getBoundingClientRect();
    const finger = (type: string, pointerId: number, x: number): PointerEvent =>
      new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX: bounds.left + x,
        clientY: bounds.top + bounds.height / 2,
        bubbles: true,
      });
    // Both fingers right of the centre, spreading apart: zoom in toward their midpoint.
    canvas.dispatchEvent(finger('pointerdown', 1, 170));
    canvas.dispatchEvent(finger('pointerdown', 2, 210));
    canvas.dispatchEvent(finger('pointermove', 2, 250));
    expect(element.view.fieldOfView).toBeLessThan(90);
    expect(element.view.yaw).toBeGreaterThan(0);
  });

  it('zooms toward the pointer: a wheel over the right edge turns the view right as it narrows', async () => {
    const element = await createReady();
    wheelOver(control(element, 'canvas', HTMLCanvasElement), { x: 0.95, y: 0.5 });
    expect(element.view.fieldOfView).toBeCloseTo(90 / 1.1, 6);
    expect(element.view.yaw).toBeGreaterThan(0);
  });

  it('shows a hand over the picture only where a drag moves it', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    const hover = (): void => {
      canvas.dispatchEvent(pointer('pointermove', { x: 50, y: 50 }));
    };
    hover();
    expect(getComputedStyle(canvas).cursor).toBe('grab');

    element.setViewMode('raw-lenses');
    hover();
    expect(getComputedStyle(canvas).cursor).not.toBe('grab');

    wheelOver(canvas, { x: 0.25, y: 0.5 });
    expect(getComputedStyle(canvas).cursor).toBe('grab');
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
    expect(menuOf(element, 'view-mode').checked).toEqual(['equirectangular']);
    element.setAttribute('view-mode', 'bogus');
    expect(menuOf(element, 'view-mode')).toEqual({
      choices: ['normal', 'equirectangular', 'raw-lenses'],
      checked: ['equirectangular'],
    });

    const changed = nextEvent<string>(element, 'stabilizationchange');
    element.setStabilization('off');
    expect(await changed).toBe('off');
    expect(menuOf(element, 'stabilization').checked).toEqual(['off']);

    element.loop = true;
    element.poster = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    expect(control(element, '.poster', HTMLImageElement).src).toContain('data:image/gif');
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(readies).toEqual([]);
  });

  it('keeps a setting chosen in the menu when it reloads', async () => {
    const element = await createReady({ stabilization: 'horizon' });
    control(element, '.stabilization-button', HTMLButtonElement).click();
    control(element, '.stabilization-menu [data-choice="off"]', HTMLButtonElement).click();
    await element.load();
    expect(element.stabilization).toBe('off');
    expect(menuOf(element, 'stabilization').checked).toEqual(['off']);
  });

  it('offers stabilization only in the view modes it changes', async () => {
    const element = await createReady();
    const stabilization = control(element, '.stabilization-button', HTMLButtonElement);
    expect(stabilization.hidden).toBe(false);

    control(element, '.view-mode-button', HTMLButtonElement).click();
    control(element, '.view-mode-menu [data-choice="raw-lenses"]', HTMLButtonElement).click();
    expect(element.viewMode).toBe('raw-lenses');
    expect(stabilization.hidden).toBe(true);
    expect(getComputedStyle(stabilization).display).toBe('none');

    element.setViewMode('equirectangular');
    expect(stabilization.hidden).toBe(false);
  });

  it('reports the settings in effect whether or not an attribute names them', async () => {
    const element = await createReady();
    expect(element.stabilization).toBe('lock');
    expect(element.viewMode).toBe('normal');
    expect(element.fov).toBe(90);
    expect(element.muted).toBe(false);
  });

  it('warns about a setting attribute naming a choice it does not know, and keeps the setting', async () => {
    const element = await createReady();
    const warned = nextEvent<string>(element, 'warning');
    element.setAttribute('view-mode', 'little-planet');
    expect(await warned).toBe(
      'ignoring view-mode="little-planet"; expected one of normal, equirectangular, raw-lenses',
    );
    expect(element.viewMode).toBe('normal');
  });

  it('refuses a setting value it cannot take', async () => {
    const element = await createReady();
    const setStabilization = (value: string): void => {
      (element as unknown as { stabilization: string }).stabilization = value;
    };
    expect(() => {
      setStabilization('wobble');
    }).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    expect(() => {
      element.fov = NaN;
    }).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    expect(element.stabilization).toBe('lock');
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

  it('reloads the same local files, and plays src again once it changes', async () => {
    const element = create({ controls: '', src: `${X5_RECORDING_URL}.missing` });
    const bytes = await fetchBytes(X5_RECORDING_URL);
    const firstReady = nextEvent(element, 'ready');
    element.loadFiles({ main: new File([bytes], 'VID_20260814_132640_00_013.insv') });
    await firstReady;

    await element.load();
    expect(element.status).toBe('ready');

    const failed = nextEvent<{ code: string }>(element, 'error');
    element.src = `${X5_RECORDING_URL}.missing`;
    const error = await failed;
    expect(error.code).toBe('source-unreadable');
  });

  it('closes an open menu on a tap on the picture without also toggling play', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    control(element, '.view-mode-button', HTMLButtonElement).click();

    canvas.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 10, y: 10 }));
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(control(element, '.view-mode-menu', HTMLElement).hidden).toBe(true);
    expect(element.status).toBe('ready');
  });

  it('keeps the controls up while a menu is open, and wakes them for keys the menu keeps', async () => {
    const element = await createReady();
    const controls = control(element, '.controls', HTMLElement);
    control(element, '.view-mode-button', HTMLButtonElement).click();
    element.dataset['idle'] = '';
    // Pointer events switch at once; the opacity fades.
    expect(getComputedStyle(controls).pointerEvents).not.toBe('none');

    pressKey(control(element, '.view-mode-menu [data-choice="normal"]', HTMLButtonElement), 'q');
    expect(element.dataset['idle']).toBeUndefined();

    control(element, '.view-mode-button', HTMLButtonElement).click();
    element.dataset['idle'] = '';
    expect(getComputedStyle(controls).pointerEvents).toBe('none');
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

  it('lets an open menu take the Escape and stays in fullscreen until the next one', async () => {
    const element = await createReady();
    await element.toggleFullscreen();
    control(element, '.view-mode-button', HTMLButtonElement).click();
    const popup = control(element, '.view-mode-menu', HTMLElement);
    expect(popup.hidden).toBe(false);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true });
    control(element, '.view-mode-menu [data-choice="normal"]', HTMLButtonElement).dispatchEvent(
      escape,
    );

    expect(popup.hidden).toBe(true);
    const isFilling =
      document.fullscreenElement === element || element.dataset['fill'] !== undefined;
    expect(isFilling).toBe(true);
    await element.toggleFullscreen();
  });

  it('unloads when removed from the document', async () => {
    const element = await createReady();
    element.remove();
    expect(element.status).toBe('idle');
  });
});
