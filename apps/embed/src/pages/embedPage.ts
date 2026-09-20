import { defineGyroView, type GyroViewElement } from '@gyroview/player';

import { embedderOriginOf } from './embedderOrigin';
import { windowEndpoint } from '../bridge/Endpoint';
import { EmbedHost } from '../bridge/EmbedHost';
import { embedPageRequestOf } from '../bridge/embedUrl';

/**
 * `embed.html`: a full-viewport `<gyro-view>` configured by the query string, driven by the
 * embedding page over `postMessage` when one names itself.
 */
export function startEmbedPage(page: Window & typeof globalThis): GyroViewElement {
  defineGyroView();
  const element = page.document.createElement('gyro-view') as GyroViewElement;
  const { attributes } = embedPageRequestOf(new URLSearchParams(page.location.search));
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
      windowEndpoint({
        target: page.parent,
        targetOrigin: embedderOrigin,
        listenOn: page,
        allowedOrigins: [embedderOrigin],
        expectedSource: page.parent,
      }),
    );
  }
  return element;
}
