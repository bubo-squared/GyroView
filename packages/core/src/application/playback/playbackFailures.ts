import { GyroViewError } from '../../shared/errors/GyroViewError';

/**
 * A failure met while playing, as the session reports it: typed failures as they are, anything
 * else as `decode`.
 */
export function playbackFailureOf(error: unknown): GyroViewError {
  return error instanceof GyroViewError
    ? error
    : new GyroViewError('decode', 'playback failed', { cause: error });
}

/**
 * A failure of the sink drawing the picture: typed failures as they are, anything else as
 * `render-unavailable`, so a page can tell a GPU that gave up from a stream that broke.
 */
export function renderFailureOf(error: unknown): GyroViewError {
  return error instanceof GyroViewError
    ? error
    : new GyroViewError('render-unavailable', 'the picture could not be drawn', { cause: error });
}
