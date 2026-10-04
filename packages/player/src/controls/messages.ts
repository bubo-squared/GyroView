import type { GyroViewErrorCode, StabilizationMode, ViewMode } from '@gyroview/core';

/**
 * The element's labels: what its buttons, sliders, menus and overlays are called, and its own
 * name for assistive technology.
 */
export interface GyroViewLabels {
  /**
   * The element's name, unless the page names it.
   */
  readonly player: string;
  readonly loading: string;
  readonly play: string;
  readonly pause: string;
  readonly seek: string;
  /**
   * How the seek bar tells assistive technology where it is: `{time}` and `{duration}` are
   * replaced.
   */
  readonly position: string;
  readonly mute: string;
  readonly volume: string;
  readonly resetView: string;
  /**
   * The toggle that lets the device's own turns turn the normal view.
   */
  readonly motionLook: string;
  readonly stabilization: string;
  readonly viewMode: string;
  readonly fullscreen: string;
  /**
   * The button that closes a menu shown over the whole player, as it is on a narrow one.
   */
  readonly close: string;
}

export type LabelName = keyof GyroViewLabels;

/**
 * Every word `<gyro-view>` shows, or says to assistive technology: English by default, each
 * replaceable through the element's `messages` property.
 */
export interface GyroViewMessages {
  readonly labels: GyroViewLabels;
  readonly stabilizationModes: Readonly<Record<StabilizationMode, string>>;
  /**
   * One line under each choice of the Stabilization menu, where there is room for it.
   */
  readonly stabilizationModeDescriptions: Readonly<Record<StabilizationMode, string>>;
  readonly viewModes: Readonly<Record<ViewMode, string>>;
  /**
   * One line under each choice of the View menu, where there is room for it.
   */
  readonly viewModeDescriptions: Readonly<Record<ViewMode, string>>;
  /**
   * What a visitor reads when a recording cannot play, by the failure's code. The `error`
   * event carries the developer's account of it.
   */
  readonly errors: Readonly<Record<GyroViewErrorCode, string>>;
}

/**
 * The words a page gives: any of them, table by table.
 */
export type GyroViewMessageOverrides = {
  readonly [Table in keyof GyroViewMessages]?: Partial<GyroViewMessages[Table]>;
};

/**
 * The tables that name a menu's choices, by the choice.
 */
export type ChoiceTable =
  'stabilizationModes' | 'stabilizationModeDescriptions' | 'viewModes' | 'viewModeDescriptions';

/**
 * The words one menu gives each choice: its name and its description.
 */
export interface ChoiceWords {
  readonly names: ChoiceTable;
  readonly descriptions: ChoiceTable;
}

export const STABILIZATION_WORDS: ChoiceWords = {
  names: 'stabilizationModes',
  descriptions: 'stabilizationModeDescriptions',
};

export const VIEW_MODE_WORDS: ChoiceWords = {
  names: 'viewModes',
  descriptions: 'viewModeDescriptions',
};

const CHOICE_TABLES: ReadonlySet<string> = new Set(
  [STABILIZATION_WORDS, VIEW_MODE_WORDS].flatMap((words) => [words.names, words.descriptions]),
);

const UNREACHABLE = 'The video could not be loaded.';
const UNSUPPORTED_BROWSER = 'This browser cannot play this video.';
const UNREADABLE = 'This file cannot be played.';
const FAILED = 'The video could not be played.';

/**
 * A record, so a new failure code cannot be left without words for a visitor.
 */
const ERRORS: Readonly<Record<GyroViewErrorCode, string>> = {
  'binary-out-of-bounds': UNREADABLE,
  'binary-unsafe-integer': UNREADABLE,
  'codec-unsupported': UNSUPPORTED_BROWSER,
  cors: UNREACHABLE,
  decode: FAILED,
  'embed-destroyed': FAILED,
  'index-out-of-range': FAILED,
  'invalid-argument': FAILED,
  'invalid-byte-range': UNREACHABLE,
  'invalid-calibration': UNREADABLE,
  'invalid-protobuf': UNREADABLE,
  'invalid-trailer': UNREADABLE,
  'invariant-violation': FAILED,
  'missing-second-file': 'Part of this recording is missing.',
  'no-calibration': UNREADABLE,
  'no-info-record': UNREADABLE,
  'no-key-frame': UNREADABLE,
  'playback-blocked': FAILED,
  'range-unsupported': UNREACHABLE,
  'render-unavailable': UNSUPPORTED_BROWSER,
  'source-changed': 'The video was replaced while it played.',
  'source-truncated': UNREACHABLE,
  'source-unreadable': UNREACHABLE,
  'unsupported-calibration': UNREADABLE,
  'unsupported-container': UNREADABLE,
  'unsupported-gyro-record': UNREADABLE,
  'unsupported-info-format': UNREADABLE,
  'unsupported-layout': UNREADABLE,
  'webcodecs-unavailable': UNSUPPORTED_BROWSER,
};

export const DEFAULT_MESSAGES: GyroViewMessages = {
  labels: {
    player: '360° video player',
    loading: 'Loading',
    play: 'Play',
    pause: 'Pause',
    seek: 'Seek',
    position: '{time} of {duration}',
    mute: 'Mute',
    volume: 'Volume',
    resetView: 'Reset view',
    motionLook: 'Look by moving the device',
    stabilization: 'Stabilization',
    viewMode: 'View',
    fullscreen: 'Fullscreen',
    close: 'Close',
  },
  stabilizationModes: { off: 'Off', lock: 'Lock', horizon: 'Horizon', follow: 'Follow' },
  stabilizationModeDescriptions: {
    off: 'Footage as the camera moved',
    lock: 'Orientation fixed to the world',
    horizon: 'Level horizon, follows heading',
    follow: 'Follows turns, smooths out shake',
  },
  viewModes: { 'raw-lenses': 'Raw lenses', equirectangular: 'Equirectangular', normal: 'Normal' },
  viewModeDescriptions: {
    'raw-lenses': 'Both fisheye images as recorded',
    equirectangular: 'The full 360° frame, unwrapped',
    normal: 'Standard view, drag to look around',
  },
  errors: ERRORS,
};

/**
 * The default words with the page's own in their place. What is not a string is left out, so a
 * partial or mistyped table still leaves every word said.
 */
export function messagesWith(overrides: unknown): GyroViewMessages {
  const given = isRecord(overrides) ? overrides : {};
  return {
    labels: tableWith(DEFAULT_MESSAGES.labels, given['labels']),
    stabilizationModes: tableWith(DEFAULT_MESSAGES.stabilizationModes, given['stabilizationModes']),
    stabilizationModeDescriptions: tableWith(
      DEFAULT_MESSAGES.stabilizationModeDescriptions,
      given['stabilizationModeDescriptions'],
    ),
    viewModes: tableWith(DEFAULT_MESSAGES.viewModes, given['viewModes']),
    viewModeDescriptions: tableWith(
      DEFAULT_MESSAGES.viewModeDescriptions,
      given['viewModeDescriptions'],
    ),
    errors: tableWith(DEFAULT_MESSAGES.errors, given['errors']),
  };
}

export function isLabelName(name: string | null): name is LabelName {
  return name !== null && Object.hasOwn(DEFAULT_MESSAGES.labels, name);
}

export function isChoiceTable(name: string | null): name is ChoiceTable {
  return name !== null && CHOICE_TABLES.has(name);
}

function tableWith<Table extends object>(defaults: Table, overrides: unknown): Table {
  if (!isRecord(overrides)) return defaults;
  const words = Object.entries(defaults).map(([key, word]) => {
    const given = overrides[key];
    return [key, typeof given === 'string' ? given : word] as const;
  });
  return Object.fromEntries(words) as Table;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
