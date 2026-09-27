import type { StabilizationMode, ViewMode } from '@gyroview/core';

/**
 * The attributes `<gyro-view>` takes, for a framework's JSX declaration of the element (React,
 * Preact, Solid): each is optional, a number may be given as text, and a boolean attribute is
 * set by `true`.
 */
export interface GyroViewAttributes {
  readonly src?: string | undefined;
  readonly src2?: string | undefined;
  readonly poster?: string | undefined;
  readonly preload?: 'none' | 'auto' | undefined;
  readonly 'gain-match'?: 'on' | 'off' | undefined;
  readonly autoplay?: boolean | undefined;
  readonly muted?: boolean | undefined;
  readonly loop?: boolean | undefined;
  readonly controls?: boolean | undefined;
  readonly stabilization?: StabilizationMode | undefined;
  readonly 'view-mode'?: ViewMode | undefined;
  readonly fov?: number | string | undefined;
  readonly yaw?: number | string | undefined;
  readonly pitch?: number | string | undefined;
}
