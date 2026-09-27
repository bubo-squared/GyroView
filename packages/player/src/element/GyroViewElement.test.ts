import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { defineGyroView } from './defineGyroView';
import { GyroViewElement } from './GyroViewElement';
import { queryShadow } from '../controls/controlParts';
import { choiceMenuClasses, type ChoiceMenuName } from '../controls/controlsMarkup';
import type { PlayerWarning } from '../player/PlayerEvents';
import { expectIconOnly } from '../test/controls';
import { fetchBytes, X5_RECORDING_URL, X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';
import { nextEvent, settle, waitFor } from '../test/waiting';

/**
 * A desktop page, wider than any phone: the bar must fit the player, not the page.
 */
const WIDE_PAGE = { width: 1280, height: 720 };

beforeAll(() => {
  defineGyroView();
});

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
function menuOf(
  element: GyroViewElement,
  name: ChoiceMenuName,
): { choices: string[]; checked: string[] } {
  const popup = control(element, `.${choiceMenuClasses(name).popup}`, HTMLElement);
  const items = popup.querySelectorAll<HTMLElement>(':scope [role="menuitemradio"]');
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

/**
 * Whether the element fills the screen, through the Fullscreen API or pinned over the page.
 */
function isFillingTheScreen(element: GyroViewElement): boolean {
  return document.fullscreenElement === element || element.dataset['fill'] !== undefined;
}

/**
 * Every part of the control bar ends within the element, none clipped out of reach.
 */
function expectBarWithin(element: GyroViewElement): void {
  const bounds = element.getBoundingClientRect();
  for (const part of control(element, '.row', HTMLElement).children) {
    expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
  }
}

/**
 * A finger's press or release, composed as the browser's own events are, so the host hears it.
 */
function touchOf(type: string): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 3,
    pointerType: 'touch',
    bubbles: true,
    composed: true,
    isPrimary: true,
  });
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

/**
 * A touch of finger `pointerId` at `x` along a line across the picture.
 */
function fingerAt(type: string, pointerId: number, x: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: 50,
    bubbles: true,
    isPrimary: true,
  });
}

describe('<gyro-view>', () => {
  const elements: GyroViewElement[] = [];

  function create(attributes: Record<string, string> = {}): GyroViewElement {
    const element = document.createElement('gyro-view');
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

  it('keeps the properties a page set before the element was defined', async () => {
    const element = document.createElement('gyro-view-defined-late');
    Object.assign(element, { src: X5_RECORDING_URL, muted: true, controls: true });
    element.style.width = '256px';
    document.body.append(element);
    customElements.define('gyro-view-defined-late', class extends GyroViewElement {});
    const upgraded = element as GyroViewElement;
    elements.push(upgraded);
    expect(upgraded.getAttribute('src')).toBe(X5_RECORDING_URL);
    expect(upgraded.controls).toBe(true);
    await nextEvent(upgraded, 'ready');
    expect(upgraded.muted).toBe(true);
  });

  it('warns of a property set before definition that its setter refuses, and applies the rest', async () => {
    const element = document.createElement('gyro-view-refused-late');
    Object.assign(element, { src: X5_RECORDING_URL, fov: 'wide', muted: true });
    element.style.width = '256px';
    const warnings: PlayerWarning[] = [];
    element.addEventListener('warning', (event) => {
      warnings.push((event as CustomEvent<PlayerWarning>).detail);
    });
    document.body.append(element);
    customElements.define('gyro-view-refused-late', class extends GyroViewElement {});
    const upgraded = element as GyroViewElement;
    elements.push(upgraded);
    expect(warnings).toEqual([
      {
        code: 'refused-property',
        message: expect.stringContaining('fov set before the element was defined') as string,
      },
    ]);
    expect(upgraded.muted).toBe(true);
    await nextEvent(upgraded, 'ready');
  });

  it('refuses a time that is not a finite number, even while a load waits', () => {
    const element = create({ controls: '' });
    element.src = X5_RECORDING_URL;
    expect(() => {
      element.currentTime = NaN;
    }).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('plays and seeks what src names in the same task, as a media element does', async () => {
    const element = create({ controls: '' });
    element.src = X5_RECORDING_URL;
    element.currentTime = 1.5;
    await element.play();
    expect(element.paused).toBe(false);
    expect(element.currentTime).toBeGreaterThanOrEqual(1.5);
  });

  it('autoplays a new src from a time set with it, without playing from the start first', async () => {
    const element = create({ controls: '', autoplay: '' });
    const heard: string[] = [];
    for (const name of ['seeking', 'playing']) {
      element.addEventListener(name, () => {
        heard.push(name);
      });
    }
    element.src = X5_RECORDING_URL;
    element.currentTime = 1.5;
    await waitFor(() => heard.includes('playing'), 'playback');
    expect(heard[0]).toBe('seeking');
    expect(element.currentTime).toBeGreaterThanOrEqual(1.5);
  });

  it('loads nothing once removed in the task that set its src', async () => {
    const element = create({ controls: '' });
    element.src = X5_RECORDING_URL;
    const playing = element.play();
    element.remove();
    await playing;
    expect(element.status).toBe('idle');
    expect(element.paused).toBe(true);
  });

  it('starts playing on its own once loaded when told to autoplay', async () => {
    const element = create({ controls: '', autoplay: '' });
    const playing = nextEvent(element, 'play');
    element.src = X5_RECORDING_URL;
    await playing;
    expect(element.paused).toBe(false);
  });

  it('is a named region for assistive technology, unless the page describes it otherwise', () => {
    const element = create();
    expect(element.getAttribute('role')).toBe('region');
    expect(element.getAttribute('aria-label')).toBe('360° video player');
    const described = create({ role: 'application', 'aria-labelledby': 'caption' });
    expect(described.getAttribute('role')).toBe('application');
    expect(described.hasAttribute('aria-label')).toBe(false);
  });

  it("keeps the controls up while the keyboard's focus is in them", async () => {
    const element = await createReady();
    const controls = control(element, '.controls', HTMLElement);
    control(element, '.fullscreen', HTMLButtonElement).focus();
    element.dataset['idle'] = '';
    expect(getComputedStyle(controls).pointerEvents).not.toBe('none');
    control(element, '.fullscreen', HTMLButtonElement).blur();
    expect(getComputedStyle(controls).pointerEvents).toBe('none');
  });

  it('styles its shadow tree with adopted stylesheets, which a CSP does not refuse as it does <style>', () => {
    const [first, second] = [create({ controls: '' }), create({ controls: '' })];
    expect(first.shadowRoot?.querySelector('style')).toBeNull();
    expect(first.shadowRoot?.adoptedStyleSheets).toHaveLength(2);
    expect(second.shadowRoot?.adoptedStyleSheets).toEqual(first.shadowRoot?.adoptedStyleSheets);
    expect(getComputedStyle(control(first, '.controls', HTMLElement)).position).toBe('absolute');
  });

  it('says every word in the language a page gives it, its own name included', () => {
    const element = create({ controls: '' });
    const named = create({ controls: '', 'aria-label': 'Harbour at dawn' });
    for (const target of [element, named]) {
      target.messages = {
        labels: { player: 'Lecteur vidéo 360°', play: 'Lecture', viewMode: 'Vue' },
        viewModes: { 'raw-lenses': 'Objectifs bruts' },
      };
    }
    const viewMenu = control(element, '.view-mode-menu', HTMLElement);
    expect(element.getAttribute('aria-label')).toBe('Lecteur vidéo 360°');
    expect(named.getAttribute('aria-label')).toBe('Harbour at dawn');
    expect(control(element, '.play', HTMLButtonElement).getAttribute('aria-label')).toBe('Lecture');
    expect(control(element, '.view-mode-button', HTMLButtonElement).ariaLabel).toBe('Vue');
    expect(viewMenu.querySelector('[data-choice="raw-lenses"]')?.textContent).toBe(
      'Objectifs bruts',
    );
    expect(control(element, '.stop', HTMLButtonElement).getAttribute('aria-label')).toBe('Stop');
    expect(element.messages.labels.play).toBe('Lecture');

    element.messages = null;
    expect(element.getAttribute('aria-label')).toBe('360° video player');
    expect(control(element, '.play', HTMLButtonElement).getAttribute('aria-label')).toBe('Play');
  });

  it('names the parts a page may style: the overlays and the big play button among them', () => {
    const element = create({ controls: '' });
    const parts = [...(element.shadowRoot?.querySelectorAll('[part]') ?? [])].map((node) =>
      node.getAttribute('part'),
    );
    expect(parts).toEqual(
      expect.arrayContaining(['loading', 'error', 'error-message', 'error-code', 'big-play']),
    );
  });

  it('mirrors its source and presentation attributes as properties and takes focus', () => {
    const element = create({ controls: '', src: X5_RECORDING_URL });
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
      expectIconOnly(button);
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
    // The seek slider takes its arrows itself, seeking five seconds a press.
    pressKey(control(element, '.seek', HTMLInputElement), 'ArrowLeft');
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
      views.push(event.detail.yaw);
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

  it('brings hidden controls back on a touch without also toggling play, and toggles on the next', async () => {
    const element = await createReady();
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    // Synthetic touches are no active pointers, so the browser would refuse to capture them.
    canvas.setPointerCapture = (): void => undefined;
    element.dataset['idle'] = '';
    canvas.dispatchEvent(touchOf('pointerdown'));
    canvas.dispatchEvent(touchOf('pointerup'));
    await settle();
    expect(element.dataset['idle']).toBeUndefined();
    expect(element.paused).toBe(true);

    const playing = nextEvent(element, 'play');
    canvas.dispatchEvent(touchOf('pointerdown'));
    canvas.dispatchEvent(touchOf('pointerup'));
    await playing;
  });

  it('toggles play on every touch when it has no controls to bring back', async () => {
    const element = await createReady({ controls: '' });
    element.controls = false;
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    canvas.setPointerCapture = (): void => undefined;
    element.dataset['idle'] = '';
    const playing = nextEvent(element, 'play');
    canvas.dispatchEvent(touchOf('pointerdown'));
    canvas.dispatchEvent(touchOf('pointerup'));
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
    await settle();
    expect(element.view.yaw).toBe(0);
    expect(element.status).toBe('ready');
  });

  it('forgets a finger whose capture was lost, so the next one drags instead of pinching', () => {
    const element = create({ controls: '' });
    const canvas = control(element, 'canvas', HTMLCanvasElement);
    canvas.setPointerCapture = (): void => undefined;
    canvas.dispatchEvent(fingerAt('pointerdown', 5, 100));
    canvas.dispatchEvent(fingerAt('lostpointercapture', 5, 100));
    const { fieldOfView } = element.view;
    canvas.dispatchEvent(fingerAt('pointerdown', 6, 100));
    canvas.dispatchEvent(fingerAt('pointermove', 6, 160));
    expect(element.view.yaw).not.toBe(0);
    expect(element.view.fieldOfView).toBe(fieldOfView);
  });

  it('zooms a pinch toward the point between the fingers', () => {
    const element = create({ controls: '' });
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

  it('zooms toward the pointer: a wheel over the right edge turns the view right as it narrows', () => {
    const element = create({ controls: '' });
    wheelOver(control(element, 'canvas', HTMLCanvasElement), { x: 0.95, y: 0.5 });
    expect(element.view.fieldOfView).toBeCloseTo(90 / 1.1, 6);
    expect(element.view.yaw).toBeGreaterThan(0);
  });

  it('shows a hand over the picture only where a drag moves it', () => {
    const element = create({ controls: '' });
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

  it('applies view, playback and poster attributes without reloading', async () => {
    const element = await createReady();
    const statuses: string[] = [];
    element.addEventListener('statuschange', (event) => {
      statuses.push(event.detail);
    });

    element.setAttribute('pitch', '15');
    element.fov = 60;
    element.loop = true;
    element.poster = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    expect(element.view).toMatchObject({ pitch: 15, fieldOfView: 60 });
    expect(element.loop).toBe(true);
    expect(control(element, '.poster', HTMLImageElement).src).toContain('data:image/gif');
    await settle();
    expect(statuses).toEqual([]);
    expect(element.status).toBe('ready');
  });

  it('shows a view mode set by its method in the View menu, and keeps it past an unknown value', async () => {
    const element = create({ controls: '' });
    const modeChanged = nextEvent<string>(element, 'viewmodechange');
    element.setViewMode('equirectangular');
    expect(await modeChanged).toBe('equirectangular');
    expect(element.viewMode).toBe('equirectangular');
    element.setAttribute('view-mode', 'bogus');
    expect(menuOf(element, 'view-mode')).toEqual({
      choices: ['normal', 'equirectangular', 'raw-lenses'],
      checked: ['equirectangular'],
    });
  });

  it('shows a stabilization set by its method in the Stabilization menu', async () => {
    const element = create({ controls: '' });
    const changed = nextEvent<string>(element, 'stabilizationchange');
    element.setStabilization('off');
    expect(await changed).toBe('off');
    expect(menuOf(element, 'stabilization').checked).toEqual(['off']);
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

  it('reports the settings in effect whether or not an attribute names them', () => {
    const element = create({ controls: '' });
    expect(element.stabilization).toBe('lock');
    expect(element.viewMode).toBe('normal');
    expect(element.fov).toBe(90);
    expect(element.muted).toBe(false);
  });

  it('warns about a setting attribute naming a choice it does not know, and keeps the setting', async () => {
    const element = create({ controls: '' });
    const warned = nextEvent<PlayerWarning>(element, 'warning');
    element.setAttribute('view-mode', 'little-planet');
    expect(await warned).toEqual({
      code: 'ignored-attribute',
      message:
        'ignoring view-mode="little-planet"; expected one of normal, equirectangular, raw-lenses',
    });
    expect(element.viewMode).toBe('normal');
  });

  it('refuses a setting value it cannot take', () => {
    const element = create({ controls: '' });
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

  it('warns of a view attribute it cannot read, as it warns of an unknown choice', () => {
    const element = create({ controls: '' });
    const warnings: PlayerWarning[] = [];
    element.addEventListener('warning', (event) => {
      warnings.push(event.detail);
    });
    element.setAttribute('fov', 'wide');
    expect(warnings).toEqual([
      { code: 'ignored-attribute', message: 'ignoring fov="wide"; expected a number of degrees' },
    ]);
  });

  it('refuses an unset mode handed to its setter methods, as the embed commands do', () => {
    const element = create({ controls: '' });
    const setViewMode = element.setViewMode.bind(element) as (mode: unknown) => void;
    const setStabilization = element.setStabilization.bind(element) as (mode: unknown) => void;
    for (const unset of [undefined, null, '']) {
      expect(() => {
        setViewMode(unset);
      }).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
      expect(() => {
        setStabilization(unset);
      }).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    }
  });

  it('leaves a setting a framework unsets as it is, as removing its attribute does', () => {
    const element = create({ controls: '', 'view-mode': 'equirectangular', fov: '60' });
    const unset = element as unknown as Record<'viewMode' | 'fov' | 'volume', unknown>;
    for (const value of [undefined, null, '']) {
      unset.viewMode = value;
      unset.fov = value;
      unset.volume = value;
    }
    expect(element.viewMode).toBe('equirectangular');
    expect(element.fov).toBe(60);
    expect(element.volume).toBe(1);
  });

  it('shows an error overlay for a source it cannot read and recovers on a new src', async () => {
    const element = create({ controls: '' });
    const failed = nextEvent<{ code: string; message: string }>(element, 'error');
    element.src = `${X5_RECORDING_URL}.missing`;

    const error = await failed;

    expect(error.code).toBe('source-unreadable');
    expect(error.message).toContain('.missing');
    expect(element.dataset['status']).toBe('error');
    expect(control(element, '.error-message', HTMLElement).textContent).toBe(
      'The video could not be loaded.',
    );
    expect(control(element, '.error-code', HTMLElement).textContent).toBe('source-unreadable');
    expect(getComputedStyle(control(element, '.overlay.error', HTMLElement)).display).toBe('flex');
    expect(getComputedStyle(control(element, '.controls', HTMLElement)).display).toBe('none');

    const ready = nextEvent(element, 'ready');
    element.src = X5_RECORDING_URL;
    await ready;
    expect(element.dataset['status']).toBe('ready');

    element.src = null;
    await waitFor(() => element.status === 'idle', 'unloading');
  });

  it('reports a src that is no URL as an error, like any source it cannot read', async () => {
    const element = create({ controls: '' });
    const failed = nextEvent<{ code: string }>(element, 'error');
    // An IPv6 host left unclosed: no browser parses it.
    element.src = 'http://[::1/x.insv';
    const error = await failed;
    expect(error.code).toBe('source-unreadable');
    expect(element.dataset['status']).toBe('error');
  });

  it('plays local files handed to it, reloads them, and plays src again once it changes', async () => {
    const element = create({ controls: '', src: `${X5_RECORDING_URL}.missing` });
    const bytes = await fetchBytes(X5_RECORDING_URL);
    const firstReady = nextEvent(element, 'ready');
    element.loadFiles({ main: new File([bytes], 'VID_20260814_132640_00_013.insv') });
    await firstReady;
    expect(element.metadata?.model).toBe('Insta360 X5');

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
    await settle();

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
    // The closed menu hands the focus back to its button, which holds the controls up too.
    const focused = shadowOf(element).activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    element.dataset['idle'] = '';
    expect(getComputedStyle(controls).pointerEvents).toBe('none');
  });

  it('keeps every control of the bar within the player at every width, whatever the text size', async () => {
    await page.viewport(WIDE_PAGE.width, WIDE_PAGE.height);
    const element = await createReady();
    const root = document.documentElement;
    try {
      for (const remInPixels of [16, 20]) {
        root.style.fontSize = `${remInPixels}px`;
        // Just above each breakpoint, where the most parts show, and the narrowest player.
        for (const widthInRem of [31, 28.5, 23, 16.5, 14]) {
          element.style.width = `${widthInRem * remInPixels}px`;
          expectBarWithin(element);
        }
      }
    } finally {
      root.style.fontSize = '';
    }
  });

  it('keeps an open menu within a short player, scrolling what does not fit', async () => {
    const element = await createReady();
    const root = document.documentElement;
    try {
      for (const remInPixels of [16, 20]) {
        root.style.fontSize = `${remInPixels}px`;
        control(element, '.stabilization-button', HTMLButtonElement).click();
        const popup = control(element, '.stabilization-menu', HTMLElement);
        expect(popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          element.getBoundingClientRect().top,
        );
        expect(popup.scrollHeight).toBeGreaterThan(popup.clientHeight);
        control(element, '.stabilization-button', HTMLButtonElement).click();
      }
    } finally {
      root.style.fontSize = '';
    }
  });

  it('shows the stop button, the volume and the time where there is room', async () => {
    const element = await createReady();
    element.style.width = '640px';
    for (const part of ['.stop', '.volume', '.time']) {
      expect(getComputedStyle(control(element, part, HTMLElement)).display).not.toBe('none');
    }
  });

  it('pins itself over the whole viewport where fullscreen is refused, whatever size the page gave it', async () => {
    const element = create({
      controls: '',
      style: 'width: 300px; margin: 24px 8px; max-height: 100px',
    });
    element.requestFullscreen = (): Promise<void> => Promise.reject(new Error('refused'));
    await element.toggleFullscreen();
    expect(element.dataset['fill']).toBe('');
    const { width, height } = element.getBoundingClientRect();
    const viewport = document.documentElement;
    expect({ width, height }).toEqual({
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
  });

  it('fills the screen one way or another and leaves on Escape', async () => {
    const element = create({ controls: '' });

    await element.toggleFullscreen();
    expect(isFillingTheScreen(element)).toBe(true);

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !isFillingTheScreen(element), 'leaving fullscreen');
  });

  it('leaves the fullscreen it entered from its button when it sits inside another component', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const element = document.createElement('gyro-view');
    element.setAttribute('controls', '');
    element.style.cssText = 'width: 480px; height: 270px';
    host.attachShadow({ mode: 'open' }).append(element);
    elements.push(element);
    const ready = nextEvent(element, 'ready');
    element.src = X5_RECORDING_URL;
    await ready;
    const button = control(element, '.fullscreen', HTMLButtonElement);
    await userEvent.click(button);
    await waitFor(() => element.matches(':fullscreen'), 'entering fullscreen');
    await userEvent.click(button);
    await waitFor(() => document.fullscreenElement === null, 'leaving fullscreen');
    host.remove();
  });

  it('lets an open menu take the Escape and stays in fullscreen until the next one', async () => {
    const element = create({ controls: '' });
    await element.toggleFullscreen();
    control(element, '.view-mode-button', HTMLButtonElement).click();
    const popup = control(element, '.view-mode-menu', HTMLElement);
    expect(popup.hidden).toBe(false);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true });
    control(element, '.view-mode-menu [data-choice="normal"]', HTMLButtonElement).dispatchEvent(
      escape,
    );

    expect(popup.hidden).toBe(true);
    expect(isFillingTheScreen(element)).toBe(true);

    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !isFillingTheScreen(element), 'the next Escape leaving fullscreen');
  });

  it('unloads when removed from the document, and loads again once back', async () => {
    const element = await createReady();
    element.remove();
    await waitFor(() => element.status === 'idle', 'the unload');
    const ready = nextEvent(element, 'ready');
    document.body.append(element);
    await ready;
  });

  it('keeps its recording when moved within the document', async () => {
    const element = await createReady();
    const statuses: string[] = [];
    element.addEventListener('statuschange', (event) => {
      statuses.push(event.detail);
    });
    const box = document.createElement('div');
    document.body.append(box);
    box.append(element);
    await settle();
    expect(element.status).toBe('ready');
    expect(statuses).toEqual([]);
    box.remove();
  });

  it('loads once connected when told to load before, and not before', async () => {
    const element = document.createElement('gyro-view');
    element.style.width = '256px';
    element.src = X5_RECORDING_URL;
    const statuses: string[] = [];
    element.addEventListener('statuschange', (event) => {
      statuses.push(event.detail);
    });
    const loaded = element.load();
    await settle();
    // Out of the document nothing could let the recording go again.
    expect(element.status).toBe('idle');
    document.body.append(element);
    elements.push(element);
    await loaded;
    expect(element.status).toBe('ready');
    expect(statuses).toEqual(['loading', 'ready']);
  });

  it('loads a src set while out of the document once back in it', async () => {
    const element = await createReady();
    element.remove();
    element.src = X5_RECORDING_WITH_AUDIO_URL;
    document.body.append(element);
    await nextEvent(element, 'ready');
    expect(element.metadata?.hasAudio).toBe(true);
  });
});
