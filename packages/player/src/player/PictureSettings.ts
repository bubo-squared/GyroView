import {
  DEFAULT_STABILIZATION_MODE,
  stabilizerFor,
  type GainMatchingFrameSink,
  type StabilizationMode,
  type StabilizingFrameSink,
  type TypedEmitter,
} from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * What the settings act on in a loaded pipeline.
 */
export interface PictureTargets {
  readonly gainMatching: Pick<GainMatchingFrameSink, 'enable' | 'disable'>;
  /**
   * Absent when the recording has no gyro to stabilize with.
   */
  readonly stabilizing: Pick<StabilizingFrameSink<VideoFrame>, 'setStabilizer'> | undefined;
}

/**
 * The settings that shape the picture beyond the view, stabilization and exposure matching:
 * kept across loads, applied to whichever pipeline is attached, announced when they change.
 */
export class PictureSettings {
  private mode: StabilizationMode = DEFAULT_STABILIZATION_MODE;
  private isMatching = true;
  private targets: PictureTargets | undefined;

  public constructor(private readonly events: TypedEmitter<PlayerEvents>) {}

  public get stabilization(): StabilizationMode {
    return this.mode;
  }

  public get isMatchingGains(): boolean {
    return this.isMatching;
  }

  /**
   * The pipeline of the loaded recording, or nothing between loads.
   */
  public attach(targets: PictureTargets | undefined): void {
    this.targets = targets;
    targets?.stabilizing?.setStabilizer(stabilizerFor(this.mode));
    if (targets) matchGains(targets, this.isMatching);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.mode = mode;
    this.targets?.stabilizing?.setStabilizer(stabilizerFor(mode));
    this.events.emit('stabilizationchange', mode);
  }

  public setGainMatching(isEnabled: boolean): void {
    this.isMatching = isEnabled;
    if (this.targets) matchGains(this.targets, isEnabled);
  }
}

function matchGains(targets: PictureTargets, isMatching: boolean): void {
  if (isMatching) targets.gainMatching.enable();
  else targets.gainMatching.disable();
}
