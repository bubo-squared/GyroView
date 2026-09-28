import {
  degrees,
  GyroViewError,
  keysOf,
  type Degrees,
  type PictureQuality,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

import { pictureQualityOf, stabilizationModeOf, viewModeOf } from '../choices';
import { ensureFinite } from '../player/ensureFinite';
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
  quality: PictureQuality;
  fov: number;
  yaw: number;
  pitch: number;
  muted: boolean;
  loop: boolean;
  volume: number;
}

type Accessors = { readonly [Name in keyof LiveSettings]: Accessor };

/**
 * Every name of {@link LiveSettings} once, for what must know the settings before the element
 * defines them.
 */
export const LIVE_SETTING_NAMES = keysOf<keyof LiveSettings>({
  stabilization: true,
  viewMode: true,
  quality: true,
  fov: true,
  yaw: true,
  pitch: true,
  muted: true,
  loop: true,
  volume: true,
});

/**
 * Properties that read and change the player's settings as they are now, the way
 * `HTMLMediaElement.muted` does: the attribute of the same name configures the setting, the
 * property reports what is in effect however it was last changed (attribute, menu, keyboard,
 * gesture or script). An unset choice, angle or volume is left as it is, any other value it
 * cannot take is refused; `muted` and `loop` take any value as a boolean.
 */
export function defineLiveSettings(element: HTMLElement, player: Player): void {
  const accessors: Accessors = {
    stabilization: {
      get: (): unknown => player.stabilization,
      set: unlessUnset((value) => {
        player.setStabilization(stabilizationModeFrom(value));
      }),
    },
    viewMode: {
      get: (): unknown => player.viewMode,
      set: unlessUnset((value) => {
        player.setViewMode(viewModeFrom(value));
      }),
    },
    quality: {
      get: (): unknown => player.quality,
      set: unlessUnset((value) => {
        player.setQuality(pictureQualityFrom(value));
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
 * The stabilization mode `value` names; anything else is refused, as the element's methods and
 * the embed commands refuse it.
 */
export function stabilizationModeFrom(value: unknown): StabilizationMode {
  return accepted(value, stabilizationModeOf, 'stabilization');
}

/**
 * The view mode `value` names; anything else is refused.
 */
export function viewModeFrom(value: unknown): ViewMode {
  return accepted(value, viewModeOf, 'viewMode');
}

/**
 * The picture quality `value` names; anything else is refused.
 */
export function pictureQualityFrom(value: unknown): PictureQuality {
  return accepted(value, pictureQualityOf, 'quality');
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
  ensureFinite(value, property);
  return value;
}
