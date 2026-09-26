import { TypedEmitter, type StabilizationMode } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { PictureSettings, type PictureTargets } from './PictureSettings';
import type { PlayerEvents } from './PlayerEvents';

interface Recorded {
  readonly settings: PictureSettings;
  readonly targets: PictureTargets;
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
  const targets: PictureTargets = {
    renderer: {
      enableGainMatching: () => {
        calls.push('match gains');
      },
      disableGainMatching: () => {
        calls.push('leave gains');
      },
    },
    stabilizing: {
      setStabilizer: (stabilizer) => {
        calls.push(`stabilize ${stabilizer.constructor.name}`);
      },
    },
  };
  return { settings: new PictureSettings(events), targets, calls, announced };
}

describe('PictureSettings', () => {
  it('starts with lock stabilization and gain matching on', () => {
    const { settings } = recordedSettings();
    expect(settings.stabilization).toBe('lock');
    expect(settings.isMatchingGains).toBe(true);
  });

  it('applies what it holds to a pipeline as soon as it is attached', () => {
    const { settings, targets, calls } = recordedSettings();
    settings.setStabilization('off');
    settings.setGainMatching(false);
    settings.attach(targets);
    expect(calls).toEqual(['stabilize OffStabilization', 'leave gains']);
  });

  it('applies and announces a change to the attached pipeline', () => {
    const { settings, targets, calls, announced } = recordedSettings();
    settings.attach(targets);
    calls.length = 0;
    settings.setStabilization('horizon');
    settings.setGainMatching(false);
    expect(calls).toEqual(['stabilize HorizonStabilization', 'leave gains']);
    expect(announced).toEqual(['horizon']);
  });

  it('keeps changes made between loads for the next one', () => {
    const { settings, targets, calls } = recordedSettings();
    settings.attach(targets);
    settings.attach(undefined);
    calls.length = 0;
    settings.setStabilization('follow');
    expect(calls).toEqual([]);
    expect(settings.stabilization).toBe('follow');
  });
});
