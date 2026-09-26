import {
  DEFAULT_STABILIZATION_MODE,
  type StabilizationMode,
  type TypedEmitter,
} from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';
import type { Pipeline } from '../composition/ports';

/**
 * What the settings act on in a loaded pipeline.
 */
export type PictureTarget = Pick<Pipeline, 'setStabilization' | 'setGainMatching'>;

/**
 * The settings that shape the picture beyond the view, stabilization and exposure matching:
 * kept across loads, applied to whichever pipeline is attached, announced when they change.
 */
export class PictureSettings {
  private mode: StabilizationMode = DEFAULT_STABILIZATION_MODE;
  private isMatching = true;
  private target: PictureTarget | undefined;

  public constructor(private readonly events: TypedEmitter<PlayerEvents>) {}

  public get stabilization(): StabilizationMode {
    return this.mode;
  }

  /**
   * The pipeline of the loaded recording, or nothing between loads.
   */
  public attach(target: PictureTarget | undefined): void {
    this.target = target;
    target?.setStabilization(this.mode);
    target?.setGainMatching(this.isMatching);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.mode = mode;
    this.target?.setStabilization(mode);
    this.events.emit('stabilizationchange', mode);
  }

  public setGainMatching(isEnabled: boolean): void {
    this.isMatching = isEnabled;
    this.target?.setGainMatching(isEnabled);
  }
}
