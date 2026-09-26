/**
 * Wraps an icon's shapes in a 24-unit square. Shapes are stroked in `currentColor` unless they
 * say otherwise, so every icon takes the controls' text colour.
 */
function icon(shapes: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
}

const SPEAKER = '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor"/>';

/**
 * The controls' icons, drawn as inline SVG in `currentColor` only: a text glyph is left to the
 * platform's fonts, some of which draw it as a colour emoji.
 */
export const ICONS = {
  play: icon('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  pause: icon(
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  ),
  stop: icon(
    '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  ),
  sound: icon(`${SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6a8 8 0 0 1 0 12"/>`),
  muted: icon(`${SPEAKER}<path d="M16 9.5l5 5M21 9.5l-5 5"/>`),
  resetView: icon('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  settings: icon(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  ),
  fullscreen: icon('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
} satisfies Readonly<Record<string, string>>;
