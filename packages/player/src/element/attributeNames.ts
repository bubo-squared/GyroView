/**
 * The names of `<gyro-view>`'s attributes, with no dependencies, so an embedding page's snippet can
 * spell them without carrying the player. Published as `@gyroview/player/attributes`.
 */

/**
 * The attributes `<gyro-view>` understands. `Source` ones name what to play; changing any of
 * them reloads. `View` ones move the picture without reloading.
 */
export const SourceAttribute = {
  Src: 'src',
  Src2: 'src2',
} as const;

export const ViewAttribute = {
  FieldOfView: 'fov',
  Yaw: 'yaw',
  Pitch: 'pitch',
} as const;

export const PlaybackAttribute = {
  Autoplay: 'autoplay',
  /**
   * `none` keeps the decoders idle until play; anything else (the default) shows the first frame.
   */
  Preload: 'preload',
  /**
   * `off` leaves the lenses' exposure as recorded; anything else (the default) matches them.
   */
  GainMatch: 'gain-match',
  Muted: 'muted',
  Loop: 'loop',
  Stabilization: 'stabilization',
  /**
   * `normal`, `equirectangular` or `raw-lenses`: what the picture shows (ADR 0015).
   */
  ViewMode: 'view-mode',
  Controls: 'controls',
  Poster: 'poster',
} as const;

export const OBSERVED_ATTRIBUTES: readonly string[] = [
  ...Object.values(SourceAttribute),
  ...Object.values(ViewAttribute),
  ...Object.values(PlaybackAttribute),
];
