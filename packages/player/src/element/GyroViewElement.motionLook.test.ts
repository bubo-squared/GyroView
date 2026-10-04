import { beforeAll, describe, expect, it } from 'vitest';
import { cdp, page, server } from 'vitest/browser';

import { defineGyroView } from './defineGyroView';
import type { GyroViewElement } from './GyroViewElement';
import { queryShadow } from '../controls/controlParts';
import { X5_RECORDING_URL } from '../test/recordings';
import { nextEvent, waitFor } from '../test/waiting';

/**
 * A desktop page, wider than any phone: the bar must fit the player, not the page.
 */
const WIDE_PAGE = { width: 1280, height: 720 };
const ORIENTATION_EVENT = 'deviceorientation';

beforeAll(() => {
  defineGyroView();
});

/**
 * The device reports its attitude, as a phone does once a page listens: tipped back `tilt`
 * degrees from upright. Built as a plain event with the angles, which every browser's probe
 * reads, since a desktop WebKit refuses to construct the real one.
 */
function reportAttitude(tilt = 0): void {
  const angles = { alpha: 0, beta: 90 + tilt, gamma: 0 };
  globalThis.dispatchEvent(Object.assign(new Event(ORIENTATION_EVENT), angles));
}

const elements: GyroViewElement[] = [];

async function createReady(attributes: Record<string, string>): Promise<GyroViewElement> {
  const element = document.createElement('gyro-view');
  element.style.width = '256px';
  element.style.height = '128px';
  const named = Object.entries({ controls: '', ...attributes });
  for (const [name, value] of named) element.setAttribute(name, value);
  document.body.append(element);
  elements.push(element);
  const ready = nextEvent(element, 'ready');
  element.src = X5_RECORDING_URL;
  await ready;
  return element;
}

function toggleOf(element: GyroViewElement): HTMLButtonElement {
  const { shadowRoot } = element;
  if (!shadowRoot) throw new Error('the element has no shadow root');
  return queryShadow(shadowRoot, '.motion-look', HTMLButtonElement);
}

/**
 * Every part of the control bar ends within the element, none clipped out of reach.
 */
function expectBarWithin(element: GyroViewElement): void {
  const bounds = element.getBoundingClientRect();
  const parts = element.shadowRoot?.querySelector('.row')?.children ?? [];
  for (const part of parts) {
    expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
  }
}

/**
 * The bar at each width, just above each narrowing with the toggle shown, and at the narrowest,
 * where the toggle gives way; at two text sizes.
 */
function expectBarWithinAt(element: GyroViewElement, widthsInRem: readonly number[]): void {
  const root = document.documentElement;
  try {
    for (const remInPixels of [16, 20]) {
      root.style.fontSize = `${remInPixels}px`;
      for (const widthInRem of widthsInRem) {
        element.style.width = `${widthInRem * remInPixels}px`;
        expectBarWithin(element);
      }
    }
  } finally {
    root.style.fontSize = '';
  }
}

describe('<gyro-view> motion look', () => {
  // The page's probe hears for every element of the page: the first test sees the device report
  // for the first time, the others after it.
  it('offers motion look in the normal view once the device reports its attitude', async () => {
    const element = await createReady({ 'view-mode': 'normal' });
    const toggle = toggleOf(element);
    expect(element.motionLook).toBe('unavailable');
    expect(toggle.hidden).toBe(true);
    reportAttitude();
    expect(element.motionLook).toBe('off');
    expect(toggle.hidden).toBe(false);
    element.setViewMode('equirectangular');
    expect(toggle.hidden).toBe(true);
    element.remove();
  });

  it('turns on with a press, the view following the device, and off again', async () => {
    const element = await createReady({ 'view-mode': 'normal' });
    const toggle = toggleOf(element);
    toggle.click();
    await waitFor(() => element.motionLook === 'on', 'motion look to turn on');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    reportAttitude(30);
    expect(element.view.pitch).toBeCloseTo(30, 6);
    expect(Object.keys(element.view)).toEqual(['yaw', 'pitch', 'fieldOfView']);
    toggle.click();
    expect(element.motionLook).toBe('off');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    element.remove();
  });

  it('starts and stops through its methods too', async () => {
    const element = await createReady({ 'view-mode': 'normal' });
    await expect(element.startMotionLook()).resolves.toBe('on');
    element.stopMotionLook();
    expect(element.motionLook).toBe('off');
    element.remove();
  });

  it('keeps every control of the bar within the player with the toggle shown, whatever the text size', async () => {
    await page.viewport(WIDE_PAGE.width, WIDE_PAGE.height);
    // Stabilization offered beside the toggle: the widest the bar gets in the normal view.
    const element = await createReady({ 'view-mode': 'normal', stabilization: 'horizon' });
    expect(toggleOf(element).hidden).toBe(false);
    expectBarWithinAt(element, [38, 26.5, 20.5, 16.5, 14]);
    element.style.width = `${16.5 * 16}px`;
    expect(getComputedStyle(toggleOf(element)).display).not.toBe('none');
    element.style.width = `${14 * 16}px`;
    expect(getComputedStyle(toggleOf(element)).display).toBe('none');
    element.remove();
  });

  it.runIf(server.browser === 'chromium')(
    'keeps every control of the bar within the player on a touch screen too',
    async () => {
      await page.viewport(WIDE_PAGE.width, WIDE_PAGE.height);
      const session = cdp();
      await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5,
      });
      try {
        expect(matchMedia('(pointer: coarse)').matches).toBe(true);
        const element = await createReady({ 'view-mode': 'normal', stabilization: 'horizon' });
        expectBarWithinAt(element, [38, 30, 24, 19.5, 16]);
        element.remove();
      } finally {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      }
    },
  );
});
