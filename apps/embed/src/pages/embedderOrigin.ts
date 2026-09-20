import { ORIGIN_PARAMETER } from '../bridge/embedUrl';
import { originOf } from '../protocol/origins';

export interface FrameContext {
  readonly query: URLSearchParams;
  /**
   * `document.referrer`: the embedding page when the browser sends it.
   */
  readonly referrer: string;
  readonly isEmbedded: boolean;
}

/**
 * The one origin the frame will talk to: the one named in the URL by the snippet, else the
 * referrer's. A frame opened on its own, or embedded by a page that names nothing and sends no
 * referrer, plays without a bridge rather than talking to anyone.
 */
export function embedderOriginOf(context: FrameContext): string | undefined {
  if (!context.isEmbedded) return undefined;
  const named = context.query.get(ORIGIN_PARAMETER);
  return originOf(named ?? context.referrer);
}
