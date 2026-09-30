import { describe, expect, it } from 'vitest';

import { GyroViewError } from './GyroViewError';

describe('GyroViewError', () => {
  it('tells whose side a failure is on by its code', () => {
    expect(new GyroViewError('codec-unsupported', 'no hevc here').category).toBe('browser');
    expect(new GyroViewError('webcodecs-unavailable', 'no decoders').category).toBe('browser');
    expect(new GyroViewError('render-unavailable', 'no webgl2').category).toBe('browser');
    expect(new GyroViewError('no-calibration', 'no calibration').category).toBe('recording');
    expect(new GyroViewError('binary-out-of-bounds', 'past the end').category).toBe('recording');
    expect(new GyroViewError('cors', 'forbidden').category).toBe('source');
    expect(new GyroViewError('invalid-argument', 'yaw is NaN').category).toBe('usage');
    expect(new GyroViewError('invariant-violation', 'unexpected').category).toBe('internal');
  });

  it('holds its category as its own property, so the error written as JSON keeps it', () => {
    const error = new GyroViewError('source-changed', 'the file was replaced');
    expect(JSON.stringify(error)).toContain('"category":"source"');
  });
});
