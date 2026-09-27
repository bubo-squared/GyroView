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
  readonly stop: string;
  readonly seek: string;
  /**
   * How the seek bar tells assistive technology where it is: `{time}` and `{duration}` are
   * replaced.
   */
  readonly position: string;
  readonly mute: string;
  readonly volume: string;
  readonly resetView: string;
  readonly stabilization: string;
  readonly viewMode: string;
  readonly fullscreen: string;
}

export type LabelName = keyof GyroViewLabels;

/**
 * Every word `<gyro-view>` shows, or says to assistive technology: English by default, each
 * replaceable through the element's `messages` property.
 */
export interface GyroViewMessages {
  readonly labels: GyroViewLabels;
  readonly stabilizationModes: Readonly<Record<StabilizationMode, string>>;
  readonly viewModes: Readonly<Record<ViewMode, string>>;
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

export type ChoiceTable = 'stabilizationModes' | 'viewModes';

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
  'source-truncated': UNREACHABLE,
  'source-unreadable': UNREACHABLE,
  'unsupported-calibration': UNREADABLE,
  'unsupported-container': UNREADABLE,
  'unsupported-gyro-record': UNREADABLE,
  'unsupported-info-format': UNREADABLE,
  'unsupported-layout': UNREADABLE,
};

export const DEFAULT_MESSAGES: GyroViewMessages = {
  labels: {
    player: '360° video player',
    loading: 'Loading',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    seek: 'Seek',
    position: '{time} of {duration}',
    mute: 'Mute',
    volume: 'Volume',
    resetView: 'Reset view',
    stabilization: 'Stabilization',
    viewMode: 'View',
    fullscreen: 'Fullscreen',
  },
  stabilizationModes: { off: 'Off', lock: 'Lock', horizon: 'Horizon', follow: 'Follow' },
  viewModes: { normal: 'Normal', equirectangular: 'Equirectangular', 'raw-lenses': 'Raw lenses' },
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
    viewModes: tableWith(DEFAULT_MESSAGES.viewModes, given['viewModes']),
    errors: tableWith(DEFAULT_MESSAGES.errors, given['errors']),
  };
}

export function isLabelName(name: string | null): name is LabelName {
  return name !== null && Object.hasOwn(DEFAULT_MESSAGES.labels, name);
}

export function isChoiceTable(name: string | null): name is ChoiceTable {
  return name === 'stabilizationModes' || name === 'viewModes';
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
