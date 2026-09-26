import {
  degrees,
  GyroViewError,
  type Degrees,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

import { stabilizationModeOf, viewModeOf } from '../choices';
import type { Player } from '../player/Player';

interface Accessor {
  readonly get: () => unknown;
  readonly set: (value: unknown) => void;
}

/**
 * The player's settings as the element's properties (ADR 0016): each reports what is in effect
 * and takes a new value. The element implements it, so a property defined here is declared there.
 */
export interface LiveSettings {
  stabilization: StabilizationMode;
  viewMode: ViewMode;
  fov: number;
  yaw: number;
  pitch: number;
  muted: boolean;
  loop: boolean;
  volume: number;
}

type Accessors = { readonly [Name in keyof LiveSettings]: Accessor };

/**
 * Properties that read and change the player's settings as they are now, the way
 * `HTMLMediaElement.muted` does: the attribute of the same name configures the setting, the
 * property reports what is in effect however it was last changed (attribute, menu, keyboard,
 * gesture or script). A value the setting cannot take is refused.
 */
export function defineLiveSettings(element: HTMLElement, player: Player): void {
  const accessors: Accessors = {
    stabilization: {
      get: (): unknown => player.stabilization,
      set: (value): void => {
        player.setStabilization(accepted(value, stabilizationModeOf, 'stabilization'));
      },
    },
    viewMode: {
      get: (): unknown => player.viewMode,
      set: (value): void => {
        player.setViewMode(accepted(value, viewModeOf, 'viewMode'));
      },
    },
    ...viewAccessors(player),
    ...soundAccessors(player),
  };
  for (const [name, accessor] of Object.entries(accessors)) {
    Object.defineProperty(element, name, { configurable: true, enumerable: true, ...accessor });
  }
}

function viewAccessors(player: Player): Pick<Accessors, 'fov' | 'yaw' | 'pitch'> {
  const angle = (key: keyof ViewState): Accessor => ({
    get: (): unknown => player.view[key],
    set: (value): void => {
      player.setView({ ...player.view, [key]: angleOf(value, key) });
    },
  });
  return { fov: angle('fieldOfView'), yaw: angle('yaw'), pitch: angle('pitch') };
}

function soundAccessors(player: Player): Pick<Accessors, 'muted' | 'loop' | 'volume'> {
  return {
    muted: {
      get: (): unknown => player.isMuted,
      set: (value): void => {
        player.setMuted(Boolean(value));
      },
    },
    loop: {
      get: (): unknown => player.isLooping,
      set: (value): void => {
        player.setLooping(Boolean(value));
      },
    },
    volume: {
      get: (): unknown => player.volume,
      set: (value): void => {
        player.setVolume(numberOf(value, 'volume'));
      },
    },
  };
}

function accepted<Choice>(
  value: unknown,
  parse: (text: string | null) => Choice | undefined,
  property: string,
): Choice {
  const choice = typeof value === 'string' ? parse(value) : undefined;
  if (choice === undefined) {
    throw new GyroViewError('invalid-argument', `${property} cannot be ${String(value)}`);
  }
  return choice;
}

function angleOf(value: unknown, property: string): Degrees {
  return degrees(numberOf(value, property));
}

function numberOf(value: unknown, property: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GyroViewError('invalid-argument', `${property} must be a finite number`);
  }
  return value;
}
