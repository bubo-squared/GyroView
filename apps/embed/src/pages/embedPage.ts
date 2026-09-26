import { defineGyroView, GYRO_VIEW_TAG, type GyroViewElement } from '@gyroview/player';

import { embedderOriginOf } from './embedderOrigin';
import { windowEndpoint } from '../bridge/Endpoint';
import { EmbedHost } from '../frame/EmbedHost';
import { embedAttributesOf } from '../bridge/embedUrl';

/**
 * `embed.html`: a full-viewport `<gyro-view>` configured by the query string, driven by the
 * embedding page over `postMessage` when one names itself.
 */
export function startEmbedPage(page: Window & typeof globalThis): GyroViewElement {
  defineGyroView();
  const element = page.document.createElement(GYRO_VIEW_TAG) as GyroViewElement;
  const attributes = embedAttributesOf(new URLSearchParams(page.location.search));
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  page.document.body.append(element);
  const embedderOrigin = embedderOriginOf({
    query: new URLSearchParams(page.location.search),
    referrer: page.document.referrer,
    isEmbedded: page.parent !== page,
  });
  if (embedderOrigin !== undefined) {
    new EmbedHost(
      element,
      windowEndpoint({ peer: page.parent, peerOrigin: embedderOrigin, listenOn: page }),
    );
  }
  return element;
}
