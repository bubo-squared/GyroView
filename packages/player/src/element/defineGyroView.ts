import { GyroViewElement } from './GyroViewElement';

export const GYRO_VIEW_TAG = 'gyro-view';

declare global {
  interface HTMLElementTagNameMap {
    [GYRO_VIEW_TAG]: GyroViewElement;
  }
}

/**
 * Registers `<gyro-view>` once; a page that loads the bundle twice keeps the first definition.
 * Without a custom element registry (a server rendering the page) there is nothing to register.
 */
export function defineGyroView(): void {
  if (typeof customElements === 'undefined' || customElements.get(GYRO_VIEW_TAG)) return;
  customElements.define(GYRO_VIEW_TAG, GyroViewElement);
}
