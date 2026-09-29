import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { iconNode } from './icons';
import type { Player } from '../player/Player';

type TransportParts = Pick<ControlParts, 'play' | 'bigPlay'>;

/**
 * What the buttons command, and the paused state they show.
 */
interface TransportHost extends Pick<ControlsHost, 'togglePlay' | 'wording'> {
  readonly player: Pick<Player, 'events' | 'isPaused'>;
}

/**
 * Play and pause, on the bar and over the picture; the buttons say what a press does. Stopping
 * is left to the S key and `stop()`.
 */
export class TransportButtons {
  public constructor(
    private readonly parts: TransportParts,
    private readonly host: TransportHost,
  ) {
    const { player } = host;
    for (const button of [parts.play, parts.bigPlay]) {
      button.addEventListener('click', () => {
        host.togglePlay();
      });
    }
    player.events.on('statuschange', () => {
      this.reflect(player.isPaused);
    });
    this.reflect(player.isPaused);
  }

  private reflect(isPaused: boolean): void {
    for (const button of [this.parts.play, this.parts.bigPlay]) {
      this.host.wording.label(button, isPaused ? 'play' : 'pause');
    }
    this.parts.play.replaceChildren(iconNode(isPaused ? 'play' : 'pause'));
  }
}
