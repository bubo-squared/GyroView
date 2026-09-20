import { degrees, seconds } from '@gyroview/core';

import type { ShortcutCommand } from './keyboardShortcuts';
import type { Player } from '../player/Player';

export interface ShortcutTarget {
  readonly player: Player;
  togglePlay(): void;
  toggleFullscreen(): void;
}

type Action = (target: ShortcutTarget) => void;

const SEEK_STEP_SECONDS = 5;
const LOOK_STEP_DEGREES = 5;

function seekBy(delta: number): Action {
  return ({ player }): void => {
    player.seek(seconds(player.currentTime + delta));
  };
}

function lookBy(yawDelta: number, pitchDelta: number): Action {
  return ({ player }): void => {
    const { view } = player;
    player.lookAt(degrees(view.yaw + yawDelta), degrees(view.pitch + pitchDelta));
  };
}

const ACTIONS: ReadonlyMap<ShortcutCommand, Action> = new Map<ShortcutCommand, Action>([
  [
    'toggle-play',
    (target): void => {
      target.togglePlay();
    },
  ],
  [
    'stop',
    ({ player }): void => {
      player.stop();
    },
  ],
  ['seek-back', seekBy(-SEEK_STEP_SECONDS)],
  ['seek-forward', seekBy(SEEK_STEP_SECONDS)],
  [
    'toggle-mute',
    ({ player }): void => {
      player.setMuted(!player.isMuted);
    },
  ],
  [
    'toggle-fullscreen',
    (target): void => {
      target.toggleFullscreen();
    },
  ],
  [
    'reset-view',
    ({ player }): void => {
      player.resetView();
    },
  ],
  [
    'zoom-in',
    ({ player }): void => {
      player.zoom(1);
    },
  ],
  [
    'zoom-out',
    ({ player }): void => {
      player.zoom(-1);
    },
  ],
  ['look-left', lookBy(-LOOK_STEP_DEGREES, 0)],
  ['look-right', lookBy(LOOK_STEP_DEGREES, 0)],
  ['look-up', lookBy(0, LOOK_STEP_DEGREES)],
  ['look-down', lookBy(0, -LOOK_STEP_DEGREES)],
]);

export function runShortcut(command: ShortcutCommand, target: ShortcutTarget): void {
  ACTIONS.get(command)?.(target);
}
