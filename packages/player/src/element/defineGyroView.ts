import { lazy } from '@gyroview/core';

import { GyroViewElement } from './GyroViewElement';

export const GYRO_VIEW_TAG = 'gyro-view';

declare global {
  interface HTMLElementTagNameMap {
    [GYRO_VIEW_TAG]: GyroViewElement;
  }
}

/**
 * Registers `<gyro-view>` once. A page that loads the package twice keeps the first definition,
 * and hears once that another copy was there first, which may be another version. Without a
 * custom element registry (a server rendering the page) there is nothing to register.
 */
export function defineGyroView(): void {
  if (typeof customElements === 'undefined') return;
  const defined = customElements.get(GYRO_VIEW_TAG);
  if (defined === undefined) customElements.define(GYRO_VIEW_TAG, GyroViewElement);
  else if (defined !== GyroViewElement) warnOfAnotherCopy();
}

const warnOfAnotherCopy = lazy((): void => {
  // No element of this copy exists to dispatch a `warning` on: the console is all there is.
  // eslint-disable-next-line no-console
  console.warn(
    `<${GYRO_VIEW_TAG}> was defined by another copy of gyroview; that copy's element is used`,
  );
});
