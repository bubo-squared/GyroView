import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { iconNode } from './icons';
import type { Player } from '../player/Player';

type TransportParts = Pick<ControlParts, 'play' | 'bigPlay' | 'stop'>;

/**
 * What the buttons command, and the paused state they show.
 */
interface TransportHost extends Pick<ControlsHost, 'togglePlay'> {
  readonly player: Pick<Player, 'events' | 'isPaused' | 'stop'>;
}

/**
 * Play and pause, on the bar and over the picture, and stop; the play buttons say what a press
 * does.
 */
export class TransportButtons {
  public constructor(
    private readonly parts: TransportParts,
    host: TransportHost,
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
    player.events.on('statuschange', () => {
      this.reflect(player.isPaused);
    });
    this.reflect(player.isPaused);
  }

  private reflect(isPaused: boolean): void {
    const label = isPaused ? 'Play' : 'Pause';
    for (const button of [this.parts.play, this.parts.bigPlay]) {
      button.setAttribute('aria-label', label);
    }
    this.parts.play.replaceChildren(iconNode(isPaused ? 'play' : 'pause'));
  }
}
