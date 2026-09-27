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
 * Every name of {@link LiveSettings} once; the record makes the compiler reject a missing one.
 */
const SETTING_NAMES: Readonly<Record<keyof LiveSettings, true>> = {
  stabilization: true,
  viewMode: true,
  fov: true,
  yaw: true,
  pitch: true,
  muted: true,
  loop: true,
  volume: true,
};

/**
 * For what must know the settings before the element defines them.
 */
export const LIVE_SETTING_NAMES = Object.keys(SETTING_NAMES) as readonly (keyof LiveSettings)[];

/**
 * Properties that read and change the player's settings as they are now, the way
 * `HTMLMediaElement.muted` does: the attribute of the same name configures the setting, the
 * property reports what is in effect however it was last changed (attribute, menu, keyboard,
 * gesture or script). A value the setting cannot take is refused; an unset one is ignored.
 */
export function defineLiveSettings(element: HTMLElement, player: Player): void {
  const accessors: Accessors = {
    stabilization: {
      get: (): unknown => player.stabilization,
      set: unlessUnset((value) => {
        player.setStabilization(accepted(value, stabilizationModeOf, 'stabilization'));
      }),
    },
    viewMode: {
      get: (): unknown => player.viewMode,
      set: unlessUnset((value) => {
        player.setViewMode(accepted(value, viewModeOf, 'viewMode'));
      }),
    },
    ...viewAccessors(player),
    ...soundAccessors(player),
  };
  for (const [name, accessor] of Object.entries(accessors)) {
    Object.defineProperty(element, name, { configurable: true, enumerable: true, ...accessor });
  }
}

function viewAccessors(player: Player): Pick<Accessors, 'fov' | 'yaw' | 'pitch'> {
  const angle = (key: keyof ViewState, property: string): Accessor => ({
    get: (): unknown => player.view[key],
    set: unlessUnset((value) => {
      player.setView({ ...player.view, [key]: angleOf(value, property) });
    }),
  });
  return {
    fov: angle('fieldOfView', 'fov'),
    yaw: angle('yaw', 'yaw'),
    pitch: angle('pitch', 'pitch'),
  };
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
      set: unlessUnset((value) => {
        player.setVolume(numberOf(value, 'volume'));
      }),
    },
  };
}

/**
 * A setting unset leaves it as it is, as removing its attribute does: a framework unsets a
 * property it no longer passes with `undefined` (React), `null` or an empty string (Preact).
 */
function unlessUnset(set: (value: unknown) => void): (value: unknown) => void {
  return (value) => {
    if (value !== undefined && value !== null && value !== '') set(value);
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
