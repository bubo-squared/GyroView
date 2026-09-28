import type { PlayerWarning } from './PlayerEvents';
import type { PlayerParts } from './PlayerOptions';
import { DrawingBufferFit } from './DrawingBufferFit';
import type { Pipeline } from '../composition/ports';
import { Disposables } from '../composition/Disposables';
import type { OpenedRecording } from '../composition/OpenedRecording';
import { openRecording } from '../composition/openRecording';
import type { PlayerSource } from '../PlayerSource';

/**
 * What is running for the loaded recording; disposed as one.
 */
export interface LoadedRecording {
  readonly opened: OpenedRecording;
  readonly pipeline: Pipeline;
  /**
   * What the opening worked around, then why the recording plays without sound, if it does.
   */
  readonly warnings: readonly PlayerWarning[];
  dispose(): void;
}

export interface LoadRequest {
  readonly source: PlayerSource;
  readonly parts: PlayerParts;
  readonly signal: AbortSignal;
}

/**
 * Opens the recording and builds everything that plays it on the host's canvas. Whatever was
 * built is disposed again when a step fails or the load is aborted.
 */
export async function loadRecording(request: LoadRequest): Promise<LoadedRecording> {
  const { parts, signal } = request;
  const opened = await openRecording(request.source, parts.ports, signal);
  const disposables = new Disposables();
  disposables.add(() => {
    opened.dispose();
  });
  try {
    const built = await parts.pipelines({
      opened,
      host: parts.host,
      decoderPort: parts.ports.decoderPort,
      signal,
    });
    disposables.add(() => {
      built.dispose();
    });
    signal.throwIfAborted();
    const fit = new DrawingBufferFit(parts.host.canvas, built.renderer);
    disposables.add(() => {
      fit.dispose();
    });
    const pipeline = withBufferQuality(built, fit);
    const warnings = warningsOf(opened, pipeline);
    return { opened, pipeline, warnings, dispose: disposables.toDisposer() };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

/**
 * The quality sets how many device pixels are drawn as well as how finely they are read.
 */
function withBufferQuality(built: Pipeline, fit: DrawingBufferFit): Pipeline {
  return {
    ...built,
    setQuality: (quality): void => {
      built.setQuality(quality);
      fit.setQuality(quality);
    },
  };
}

function warningsOf(opened: OpenedRecording, pipeline: Pipeline): PlayerWarning[] {
  return [
    ...opened.warnings.map((message) => ({ code: 'recording-degraded' as const, message })),
    ...pipeline.soundWarnings.map((message) => ({ code: 'no-sound' as const, message })),
  ];
}
