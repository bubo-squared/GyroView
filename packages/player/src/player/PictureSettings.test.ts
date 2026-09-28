import { TypedEmitter, type PictureQuality, type StabilizationMode } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { PictureSettings, type PictureTarget } from './PictureSettings';
import type { PlayerEvents } from './PlayerEvents';

interface Recorded {
  readonly settings: PictureSettings;
  readonly target: PictureTarget;
  readonly calls: string[];
  readonly announced: StabilizationMode[];
  readonly qualities: PictureQuality[];
}

function recordedSettings(): Recorded {
  const calls: string[] = [];
  const announced: StabilizationMode[] = [];
  const qualities: PictureQuality[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  events.on('stabilizationchange', (mode) => {
    announced.push(mode);
  });
  events.on('qualitychange', (quality) => {
    qualities.push(quality);
  });
  const target: PictureTarget = {
    setStabilization: (mode) => {
      calls.push(`stabilize ${mode}`);
    },
    setGainMatching: (isEnabled) => {
      calls.push(isEnabled ? 'match gains' : 'leave gains');
    },
    setQuality: (quality) => {
      calls.push(`quality ${quality}`);
    },
  };
  return { settings: new PictureSettings(events), target, calls, announced, qualities };
}

describe('PictureSettings', () => {
  it('starts with lock stabilization, gain matching on and the balanced quality', () => {
    const { settings, target, calls } = recordedSettings();
    expect(settings.stabilization).toBe('lock');
    expect(settings.quality).toBe('balanced');
    settings.attach(target);
    expect(calls).toEqual(['stabilize lock', 'match gains', 'quality balanced']);
  });

  it('applies what it holds to a pipeline as soon as it is attached', () => {
    const { settings, target, calls } = recordedSettings();
    settings.setStabilization('off');
    settings.setGainMatching(false);
    settings.setQuality('high');
    settings.attach(target);
    expect(calls).toEqual(['stabilize off', 'leave gains', 'quality high']);
  });

  it('applies and announces a change to the attached pipeline', () => {
    const { settings, target, calls, announced, qualities } = recordedSettings();
    settings.attach(target);
    calls.length = 0;
    settings.setStabilization('horizon');
    settings.setGainMatching(false);
    settings.setQuality('fast');
    expect(calls).toEqual(['stabilize horizon', 'leave gains', 'quality fast']);
    expect(announced).toEqual(['horizon']);
    expect(qualities).toEqual(['fast']);
  });

  it('applies and announces nothing for the mode already in effect, so Follow keeps its smoothing', () => {
    const { settings, target, calls, announced } = recordedSettings();
    settings.attach(target);
    settings.setStabilization('follow');
    calls.length = 0;
    announced.length = 0;
    settings.setStabilization('follow');
    expect(calls).toEqual([]);
    expect(announced).toEqual([]);
  });

  it('applies and announces nothing for the quality already in effect', () => {
    const { settings, target, calls, qualities } = recordedSettings();
    settings.attach(target);
    calls.length = 0;
    settings.setQuality('balanced');
    expect(calls).toEqual([]);
    expect(qualities).toEqual([]);
  });

  it('keeps changes made between loads for the next one', () => {
    const { settings, target, calls } = recordedSettings();
    settings.attach(target);
    settings.attach(undefined);
    calls.length = 0;
    settings.setStabilization('follow');
    settings.setQuality('high');
    expect(calls).toEqual([]);
    expect(settings.stabilization).toBe('follow');
    expect(settings.quality).toBe('high');
  });
});
