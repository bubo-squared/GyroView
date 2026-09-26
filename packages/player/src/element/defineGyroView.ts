import { GyroViewElement } from './GyroViewElement';

export const GYRO_VIEW_TAG = 'gyro-view';

/**
 * Registers `<gyro-view>` once; a page that loads the bundle twice keeps the first definition.
 */
export function defineGyroView(): void {
  if (customElements.get(GYRO_VIEW_TAG)) return;
  customElements.define(GYRO_VIEW_TAG, GyroViewElement);
}
