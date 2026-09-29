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

/**
 * `Request` ones say how the recording is fetched; changing any of them reloads a recording
 * named by URL. The iframe embed carries none of them (ADR 0027).
 */
export const RequestAttribute = {
  /**
   * `use-credentials` fetches with the visitor's cookies, as a media element's `crossorigin`
   * does; `anonymous`, the default, sends them to the page's own origin only.
   */
  CrossOrigin: 'crossorigin',
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
   * `raw-lenses`, `equirectangular` or `normal`: what the picture shows (ADR 0015); the raw
   * lenses until set (ADR 0022).
   */
  ViewMode: 'view-mode',
  /**
   * `fast`, `balanced` or `high`: how finely the lens images are read and how many device
   * pixels are drawn; `balanced` until set.
   */
  Quality: 'quality',
  Controls: 'controls',
  Poster: 'poster',
} as const;

export const OBSERVED_ATTRIBUTES: readonly string[] = [
  ...Object.values(SourceAttribute),
  ...Object.values(RequestAttribute),
  ...Object.values(ViewAttribute),
  ...Object.values(PlaybackAttribute),
];
