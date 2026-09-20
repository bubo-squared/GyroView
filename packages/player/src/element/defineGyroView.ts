import { GyroViewElement } from './GyroViewElement';

export const GYRO_VIEW_TAG = 'gyro-view';

/**
 * Registers `<gyro-view>` once; a page that loads the bundle twice keeps the first definition.
 */
export function defineGyroView(tagName: string = GYRO_VIEW_TAG): void {
  if (customElements.get(tagName)) return;
  customElements.define(tagName, GyroViewElement);
}
