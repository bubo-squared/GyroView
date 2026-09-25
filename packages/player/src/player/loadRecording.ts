import type { Presentation, ViewMode, ViewState } from '@gyroview/core';

import type { PlayerParts } from './PlayerOptions';
import { Viewport } from './Viewport';
import { buildPipeline, type Pipeline } from '../composition/buildPipeline';
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
  readonly viewport: Viewport;
  dispose(): void;
}

export interface LoadRequest {
  readonly source: PlayerSource;
  readonly parts: PlayerParts;
  readonly view: ViewState;
  readonly viewMode: ViewMode;
  /**
   * Told about every presented pair, after the renderer drew it.
   */
  readonly onPresent: (presentation: Presentation<VideoFrame>) => void;
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
    const pipeline = await buildPipeline({
      opened,
      host: parts.host,
      decoderPort: parts.ports.decoderPort,
      view: request.view,
      viewMode: request.viewMode,
      onPresent: request.onPresent,
    });
    disposables.add(() => {
      pipeline.dispose();
    });
    signal.throwIfAborted();
    const viewport = new Viewport(parts.host.canvas, pipeline.renderer);
    disposables.add(() => {
      viewport.dispose();
    });
    return { opened, pipeline, viewport, dispose: disposables.toDisposer() };
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}
