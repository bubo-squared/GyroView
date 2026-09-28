import { Deferred } from '@gyroview/core';

import { PlaybackAttribute } from './attributeNames';
import { shouldPreload } from './attributes';
import { elementSourceOf, type FileSource } from './elementSource';
import type { Player } from '../player/Player';

/**
 * The element whose recording is loaded: what its attributes name, and whether it is in the
 * document.
 */
export interface LoadingElement extends HTMLElement {
  readonly autoplay: boolean;
}

/**
 * When `<gyro-view>` loads, and what. Attribute changes are read together a microtask after they
 * arrive, so a `src` set with its `src2` loads once; files handed in replace the attributes until
 * `src` or `src2` change. Only a connected element loads: one out of the document owes its load
 * to the next connection, and lets its recording go a microtask after a removal unless it was
 * only moved. A seek asked for while a load waits starts the new recording there.
 */
export class ElementLoads {
  private scheduled: Promise<void> | undefined;
  /**
   * The recording the attributes name is still to be loaded once connected: at first, after a
   * removal let it go, and after a change of source while out of the document.
   */
  private isOwed = true;
  /**
   * A `load()` asked for out of the document, settled by the load the connection starts.
   */
  private awaited: Deferred<void> | undefined;
  private startTime: number | undefined;
  private files: FileSource | undefined;

  public constructor(
    private readonly element: LoadingElement,
    private readonly player: Player,
  ) {}

  public connected(): void {
    if (this.isOwed) this.schedule();
    void this.awaited?.follow(this.scheduled ?? Promise.resolve());
    this.awaited = undefined;
  }

  /**
   * A move within the document disconnects and connects again at once: only an element still out
   * of it a microtask later lets its recording go.
   */
  public async disconnected(): Promise<void> {
    await Promise.resolve();
    if (this.element.isConnected) return;
    this.player.unload();
    this.isOwed = true;
  }

  public sourceChanged(): void {
    this.files = undefined;
    this.schedule();
  }

  public loadFiles(files: FileSource): void {
    this.files = files;
    this.schedule();
  }

  /**
   * The change already waiting to be read, or else a load now; out of the document, the load the
   * next connection starts.
   */
  public load(): Promise<void> {
    return this.element.isConnected ? (this.scheduled ?? this.reload()) : this.loadOnConnection();
  }

  /**
   * Seeks there, or starts the recording the waiting load brings there.
   */
  public seek(time: number): void {
    if (this.scheduled) this.startTime = time;
    else this.player.seek(time);
  }

  /**
   * The waiting load, however it ends: a failure has been dispatched as an `error` already.
   */
  public async settled(): Promise<void> {
    try {
      await this.scheduled;
    } catch {
      // Reported as an `error` event.
    }
  }

  private loadOnConnection(): Promise<void> {
    this.isOwed = true;
    this.awaited ??= new Deferred<void>();
    return this.awaited.promise;
  }

  private schedule(): void {
    this.isOwed = !this.element.isConnected;
    if (this.scheduled || !this.element.isConnected) return;
    const scheduled = this.loadAfterPendingChanges();
    this.scheduled = scheduled;
    void scheduled.catch(ignoreReportedFailure);
  }

  private async loadAfterPendingChanges(): Promise<void> {
    await Promise.resolve();
    this.scheduled = undefined;
    if (this.element.isConnected) await this.reload();
  }

  private reload(): Promise<void> {
    this.isOwed = false;
    const read = (attribute: string): string | null => this.element.getAttribute(attribute);
    const source = elementSourceOf(read, document.baseURI, this.files);
    delete this.element.dataset['hasFrame'];
    const startTime = this.startTime;
    this.startTime = undefined;
    if (!source) {
      this.player.unload();
      return Promise.resolve();
    }
    const loading = this.player.load(source, {
      autoplay: this.element.autoplay,
      preload: shouldPreload(read(PlaybackAttribute.Preload)),
    });
    // The player is loading now, so it starts the recording there; a later seek replaces it.
    if (startTime !== undefined) this.player.seek(startTime);
    return loading;
  }
}

/**
 * A failed load has already been dispatched as an `error` event; the promise adds nothing.
 */
function ignoreReportedFailure(): void {
  // The `error` event told the page; nobody awaits this promise.
}
