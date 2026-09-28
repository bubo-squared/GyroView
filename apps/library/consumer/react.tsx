// What a React 19 page does with the element, as the README shows it: declares <gyro-view> for
// JSX from the package's attribute type, and hears its events through a ref.
import { useEffect, useRef, type DetailedHTMLProps, type HTMLAttributes, type JSX } from 'react';
import type { GyroViewAttributes, GyroViewElement } from '@bubo-squared/gyroview';
import '@bubo-squared/gyroview/define';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'gyro-view': DetailedHTMLProps<HTMLAttributes<GyroViewElement>, GyroViewElement> &
        GyroViewAttributes;
    }
  }
}

export function Recording({ url }: { readonly url: string }): JSX.Element {
  const player = useRef<GyroViewElement>(null);
  useEffect(() => {
    const element = player.current;
    if (!element) return undefined;
    const onReady = (event: CustomEvent<{ readonly model: string | undefined }>): void => {
      document.title = event.detail.model ?? 'Recording';
    };
    element.addEventListener('ready', onReady);
    return () => {
      element.removeEventListener('ready', onReady);
    };
  }, []);
  return (
    <gyro-view
      ref={player}
      src={url}
      stabilization="lock"
      view-mode="normal"
      fov={75}
      controls
      muted
    />
  );
}
