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
    const pipeline = await parts.pipelines({
      opened,
      host: parts.host,
      decoderPort: parts.ports.decoderPort,
      signal,
    });
    disposables.add(() => {
      pipeline.dispose();
    });
    signal.throwIfAborted();
    const fit = new DrawingBufferFit(parts.host.canvas, pipeline.renderer);
    disposables.add(() => {
      fit.dispose();
    });
    return { opened, pipeline, dispose: disposables.toDisposer() };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}
