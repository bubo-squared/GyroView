import { describe, expect, it } from 'vitest';

import { DEFAULT_MESSAGES, messagesWith } from './messages';

describe('messagesWith', () => {
  it('replaces the words a page gives, table by table, and keeps the rest', () => {
    const messages = messagesWith({
      labels: { play: 'Lecture', pause: 'Pause' },
      viewModes: { 'raw-lenses': 'Objectifs bruts' },
      errors: { cors: 'La vidéo est ailleurs.' },
    });
    expect(messages.labels).toEqual({ ...DEFAULT_MESSAGES.labels, play: 'Lecture' });
    expect(messages.viewModes['raw-lenses']).toBe('Objectifs bruts');
    expect(messages.viewModes.normal).toBe('Normal');
    expect(messages.errors.cors).toBe('La vidéo est ailleurs.');
    expect(messages.errors['range-unsupported']).toBe(DEFAULT_MESSAGES.errors['range-unsupported']);
    expect(messages.stabilizationModes).toBe(DEFAULT_MESSAGES.stabilizationModes);
  });

  it('replaces the descriptions of the choices as it does their names', () => {
    const messages = messagesWith({ stabilizationModeDescriptions: { lock: 'Fixée au monde' } });
    expect(messages.stabilizationModeDescriptions.lock).toBe('Fixée au monde');
    expect(messages.stabilizationModeDescriptions.off).toBe('Footage as the camera moved');
    expect(messages.viewModeDescriptions).toBe(DEFAULT_MESSAGES.viewModeDescriptions);
  });

  it('leaves out what is not a word, and gives the defaults for no table at all', () => {
    const messages = messagesWith({
      labels: { play: 3, mute: undefined, bogus: 'x' },
      errors: 'no',
    });
    expect(messages.labels).toEqual(DEFAULT_MESSAGES.labels);
    expect(messages.errors).toBe(DEFAULT_MESSAGES.errors);
    expect(messagesWith(undefined)).toEqual(DEFAULT_MESSAGES);
    expect(messagesWith(null)).toEqual(DEFAULT_MESSAGES);
  });

  it('tells visitors what failed in their words, never the developer diagnostic', () => {
    expect(DEFAULT_MESSAGES.errors['range-unsupported']).toBe('The video could not be loaded.');
    expect(DEFAULT_MESSAGES.errors['codec-unsupported']).toBe(
      'This browser cannot play this video.',
    );
    expect(DEFAULT_MESSAGES.errors['invalid-trailer']).toBe('This file cannot be played.');
  });
});
