import {
  PlaybackAttribute,
  RequestAttribute,
  SourceAttribute,
  ViewAttribute,
} from './attributeNames';
import { CROSS_ORIGIN, GAIN_MATCH, PRELOAD } from './attributes';
import { LIVE_SETTING_NAMES } from './liveSettings';
import { propertyNameOf } from './reflectedProperties';

// The lists of `<gyro-view>`'s attributes and properties, by how the element treats them.

/**
 * Attributes whose properties mirror them, as `img.src` does: what to play and how to present
 * it. The live settings (stabilization, view mode, view angles, sound, loop) have properties of
 * their own that report the player's current state.
 */
export const STRING_ATTRIBUTES = [...Object.values(SourceAttribute), PlaybackAttribute.Poster];
export const KEYWORD_ATTRIBUTES = [PRELOAD, GAIN_MATCH];
export const NULLABLE_KEYWORD_ATTRIBUTES = [CROSS_ORIGIN];
export const BOOLEAN_ATTRIBUTES = [PlaybackAttribute.Autoplay, PlaybackAttribute.Controls];
export const SOURCE_ATTRIBUTES: readonly string[] = Object.values(SourceAttribute);
export const REQUEST_ATTRIBUTES: readonly string[] = Object.values(RequestAttribute);
/**
 * The properties a page may set before the element is defined, all kept for it.
 */
export const PUBLIC_PROPERTIES: readonly string[] = [
  ...[
    ...STRING_ATTRIBUTES,
    ...KEYWORD_ATTRIBUTES.map(({ name }) => name),
    ...BOOLEAN_ATTRIBUTES,
  ].map((name) => propertyNameOf(name)),
  ...NULLABLE_KEYWORD_ATTRIBUTES.map(({ property }) => property),
  ...LIVE_SETTING_NAMES,
  'currentTime',
  'messages',
];
export const VIEW_ATTRIBUTES: readonly string[] = Object.values(ViewAttribute);
