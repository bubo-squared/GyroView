import { clamp } from '@gyroview/core';

/**
 * Tells the stylesheet how far a range input is filled, as a fraction in `--fill`: only Firefox
 * styles the filled part of a range itself. Set through the CSSOM, which a Content Security
 * Policy does not govern as it governs style attributes.
 */
export function showSliderFill(slider: HTMLInputElement): void {
  const minimum = Number(slider.min);
  const span = Number(slider.max) - minimum;
  const fraction = span > 0 ? (Number(slider.value) - minimum) / span : 0;
  slider.style.setProperty('--fill', String(clamp(fraction, 0, 1)));
}
