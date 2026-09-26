import { TypedEmitter, type StabilizationMode } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { PictureSettings, type PictureTarget } from './PictureSettings';
import type { PlayerEvents } from './PlayerEvents';

interface Recorded {
  readonly settings: PictureSettings;
  readonly target: PictureTarget;
  readonly calls: string[];
  readonly announced: StabilizationMode[];
}

function recordedSettings(): Recorded {
  const calls: string[] = [];
  const announced: StabilizationMode[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  events.on('stabilizationchange', (mode) => {
    announced.push(mode);
  });
  const target: PictureTarget = {
    setStabilization: (mode) => {
      calls.push(`stabilize ${mode}`);
    },
    setGainMatching: (isEnabled) => {
      calls.push(isEnabled ? 'match gains' : 'leave gains');
    },
  };
  return { settings: new PictureSettings(events), target, calls, announced };
}

describe('PictureSettings', () => {
  it('starts with lock stabilization and gain matching on', () => {
    const { settings, target, calls } = recordedSettings();
    expect(settings.stabilization).toBe('lock');
    settings.attach(target);
    expect(calls).toEqual(['stabilize lock', 'match gains']);
  });

  it('applies what it holds to a pipeline as soon as it is attached', () => {
    const { settings, target, calls } = recordedSettings();
    settings.setStabilization('off');
    settings.setGainMatching(false);
    settings.attach(target);
    expect(calls).toEqual(['stabilize off', 'leave gains']);
  });

  it('applies and announces a change to the attached pipeline', () => {
    const { settings, target, calls, announced } = recordedSettings();
    settings.attach(target);
    calls.length = 0;
    settings.setStabilization('horizon');
    settings.setGainMatching(false);
    expect(calls).toEqual(['stabilize horizon', 'leave gains']);
    expect(announced).toEqual(['horizon']);
  });

  it('keeps changes made between loads for the next one', () => {
    const { settings, target, calls } = recordedSettings();
    settings.attach(target);
    settings.attach(undefined);
    calls.length = 0;
    settings.setStabilization('follow');
    expect(calls).toEqual([]);
    expect(settings.stabilization).toBe('follow');
  });
});
