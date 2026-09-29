import type { StabilizationMode, ViewMode } from '@gyroview/core';

import { parseMarkup } from './parseMarkup';

/**
 * Wraps an icon's shapes in a 24-unit square. Shapes are stroked in `currentColor` unless they
 * say otherwise, so every icon takes the controls' text colour. The stroke is 1.8 units: a line
 * 1.5 pixels wide at the 20 pixels the bar draws its icons at.
 */
function icon(shapes: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
}

/**
 * Shapes drawn on a 20-unit grid with a 1.5-unit stroke, scaled onto the 24-unit one: the stroke
 * scales with them to the 1.8 units of every other icon.
 */
function fromTwentyUnitGrid(shapes: string): string {
  return icon(`<g transform="scale(1.2)" stroke-width="1.5">${shapes}</g>`);
}

const SPEAKER = '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/>';

/**
 * The controls' icons, drawn as inline SVG in `currentColor` only: a text glyph is left to the
 * platform's fonts, some of which draw it as a colour emoji.
 */
export const ICONS = {
  play: icon('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: icon(
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  ),
  sound: icon(`${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6a8 8 0 0 1 0 12"/>`),
  muted: icon(`${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5"/>`),
  resetView: icon('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  fullscreen: icon('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
} satisfies Readonly<Record<string, string>>;

/**
 * Each stabilization mode's icon, which its menu shows beside it and its button while it is in
 * effect: records, so a mode cannot be left without one.
 */
export const STABILIZATION_ICONS: Readonly<Record<StabilizationMode, string>> = {
  off: fromTwentyUnitGrid('<path d="M2 11l2.5-3 3 4.5 3-6 3 5 2-2.5L18 11"/>'),
  lock: fromTwentyUnitGrid(
    '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
  ),
  horizon: fromTwentyUnitGrid('<circle cx="10" cy="10" r="7"/><path d="M3 10h14M8 13h4"/>'),
  follow: fromTwentyUnitGrid(
    '<path d="M3 15c3.5 0 4-9 8.5-9 2 0 3 1 4.5 1"/><path d="M14 4.5L16.5 7 14 9.5"/>',
  ),
};

/**
 * Each view mode's icon, as the stabilization modes have theirs.
 */
export const VIEW_MODE_ICONS: Readonly<Record<ViewMode, string>> = {
  'raw-lenses': fromTwentyUnitGrid(
    '<circle cx="6" cy="10" r="4.25"/><circle cx="14" cy="10" r="4.25"/>',
  ),
  equirectangular: fromTwentyUnitGrid(
    '<rect x="2" y="5" width="16" height="10" rx="1.5"/><path d="M2 10h16M7.5 5c-1.2 3.3-1.2 6.7 0 10M12.5 5c1.2 3.3 1.2 6.7 0 10"/>',
  ),
  normal: fromTwentyUnitGrid('<path d="M10 16L3.2 7.2a10 10 0 0113.6 0z"/>'),
};

export type IconName = keyof typeof ICONS;

const parsedIcons = new Map<IconName, DocumentFragment>();

/**
 * A copy of an icon for a button to show; each is parsed once per page, so changing a button's
 * icon parses nothing.
 */
export function iconNode(name: IconName): Node {
  let parsed = parsedIcons.get(name);
  if (!parsed) {
    parsed = parseMarkup(ICONS[name]);
    parsedIcons.set(name, parsed);
  }
  return parsed.cloneNode(true);
}
