import { motionLookRulesFor } from '@gyroview/core';

import type { ControlParts } from './controlParts';
import type { Player } from '../player/Player';

type MotionLookParts = Pick<ControlParts, 'motionLook'>;

export type MotionLookPlayer = Pick<
  Player,
  'events' | 'motionLook' | 'viewMode' | 'startMotionLook' | 'stopMotionLook'
>;

/**
 * The motion look toggle (ADR 0040): shown where the device reports its attitude and the view
 * mode follows the device, pressed while motion look is on. A press asks for access within the
 * tap itself, as iOS requires.
 */
export class MotionLookButton {
  public constructor(
    private readonly parts: MotionLookParts,
    private readonly player: MotionLookPlayer,
  ) {
    parts.motionLook.addEventListener('click', () => {
      if (player.motionLook === 'on') player.stopMotionLook();
      else void player.startMotionLook();
    });
    player.events.on('motionlookchange', () => {
      this.reflect();
    });
    player.events.on('viewmodechange', () => {
      this.reflect();
    });
    this.reflect();
  }

  private reflect(): void {
    const { motionLook, viewMode } = this.player;
    const button = this.parts.motionLook;
    button.hidden = motionLook === 'unavailable' || motionLookRulesFor(viewMode) === undefined;
    button.setAttribute('aria-pressed', String(motionLook === 'on'));
  }
}
