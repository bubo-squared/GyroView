import type { ControlParts } from './controlParts';
import type { ControlsHost, ControlWidget } from './ControlsHost';

const PLAY_GLYPH = '▶';
const PAUSE_GLYPH = '⏸';

export type TransportParts = Pick<
  ControlParts,
  'play' | 'bigPlay' | 'stop' | 'resetView' | 'fullscreen'
>;

/**
 * Play and pause, stop, reset the view and fullscreen; the play buttons say what a press does.
 */
export class TransportButtons implements ControlWidget {
  private readonly unsubscribe: () => void;

  public constructor(
    private readonly parts: TransportParts,
    host: ControlsHost,
  ) {
    const { player } = host;
    for (const button of [parts.play, parts.bigPlay]) {
      button.addEventListener('click', () => {
        host.togglePlay();
      });
    }
    parts.stop.addEventListener('click', () => {
      player.stop();
    });
    parts.resetView.addEventListener('click', () => {
      player.resetView();
    });
    parts.fullscreen.addEventListener('click', () => {
      host.toggleFullscreen();
    });
    this.unsubscribe = player.events.on('statuschange', () => {
      this.reflect(player.isPaused);
    });
    this.reflect(player.isPaused);
  }

  public dispose(): void {
    this.unsubscribe();
  }

  private reflect(isPaused: boolean): void {
    const label = isPaused ? 'Play' : 'Pause';
    for (const button of [this.parts.play, this.parts.bigPlay]) {
      button.setAttribute('aria-label', label);
    }
    this.parts.play.textContent = isPaused ? PLAY_GLYPH : PAUSE_GLYPH;
  }
}
