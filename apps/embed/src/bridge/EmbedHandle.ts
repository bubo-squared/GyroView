import {
  DEFAULT_PICTURE_QUALITY,
  DEFAULT_STABILIZATION_MODE,
  DEFAULT_VIEW,
  DEFAULT_VIEW_MODE,
  GyroViewError,
  isFlowing,
  isGyroViewErrorCode,
  messageOf,
  TypedEmitter,
} from '@gyroview/core';
import type { PlayerStatus } from '@gyroview/player';

import { withAbsoluteUrls } from './embedUrl';
import type { Endpoint } from './Endpoint';
import { HELLO_DEADLINE_MS, HelloWatch } from './HelloWatch';
import type { EmbedState, LoadRequest } from './EmbedState';
import {
  commandMessage,
  type EmbedEvents,
  type EventMessage,
  type ForwardedEventName,
  type CommandName,
  type ProtocolMessage,
  type ResultMessage,
  type SerializedError,
} from '../protocol/messages';

interface PendingCommand {
  readonly message: ProtocolMessage;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

const INITIAL_STATE: EmbedState = {
  status: 'idle',
  currentTime: 0,
  duration: 0,
  isPaused: true,
  volume: 1,
  isMuted: false,
  view: {
    yaw: DEFAULT_VIEW.yaw,
    pitch: DEFAULT_VIEW.pitch,
    fieldOfView: DEFAULT_VIEW.fieldOfView,
  },
  viewMode: DEFAULT_VIEW_MODE,
  motionLook: 'unavailable',
  stabilization: DEFAULT_STABILIZATION_MODE,
  quality: DEFAULT_PICTURE_QUALITY,
  metadata: undefined,
};

/**
 * The embedding page's side of the bridge: the player API as promises over the channel, the
 * player's events, and a state mirror kept current from them. Commands sent before the frame
 * first says hello wait for it. A frame that says hello again has loaded anew (moved within its
 * page, or reloaded), from its URL's options: what the old document left unanswered is asked
 * again, and the frame runs a command it may have had already only once. A frame that loads and
 * says nothing fails what waits on it, and what comes after, with `embed-unreachable`, until it
 * speaks.
 */
export class EmbedHandle {
  public readonly events = new TypedEmitter<EmbedEvents>();
  /**
   * Every command not answered yet, in the order sent.
   */
  private readonly pending = new Map<number, PendingCommand>();
  private readonly stopReceiving: () => void;
  private stateValue: EmbedState = INITIAL_STATE;
  private readonly helloWatch: HelloWatch;
  private nextId = 1;
  private isConnected = false;
  private isDestroyed = false;
  private unreachable: GyroViewError | undefined;

  /**
   * `pageUrl` gives the embedding page's base URL when a load is asked for, against which its
   * URLs are resolved: a single-page app may have moved on since the embed.
   */
  public constructor(
    private readonly endpoint: Endpoint,
    private readonly pageUrl: () => string,
    helloDeadlineMs = HELLO_DEADLINE_MS,
  ) {
    this.helloWatch = new HelloWatch(helloDeadlineMs, () => {
      this.giveUp();
    });
    this.stopReceiving = endpoint.receive((message) => {
      this.onMessage(message);
    });
  }

  public get state(): EmbedState {
    return this.stateValue;
  }

  public play(): Promise<void> {
    return this.command('play');
  }

  public pause(): Promise<void> {
    return this.command('pause');
  }

  public stop(): Promise<void> {
    return this.command('stop');
  }

  public seek(time: number): Promise<void> {
    return this.command('seek', time);
  }

  /**
   * Seeks to the key frame at or before `time`: quick, for a dragged seek bar.
   */
  public scrub(time: number): Promise<void> {
    return this.command('scrub', time);
  }

  public lookAt(yaw: number, pitch: number): Promise<void> {
    return this.command('lookAt', yaw, pitch);
  }

  public resetView(): Promise<void> {
    return this.command('resetView');
  }

  public zoom(steps: number): Promise<void> {
    return this.command('zoom', steps);
  }

  public setStabilization(mode: string): Promise<void> {
    return this.command('setStabilization', mode);
  }

  public setViewMode(mode: string): Promise<void> {
    return this.command('setViewMode', mode);
  }

  public setQuality(quality: string): Promise<void> {
    return this.command('setQuality', quality);
  }

  public setVolume(volume: number): Promise<void> {
    return this.command('setVolume', volume);
  }

  public setMuted(isMuted: boolean): Promise<void> {
    return this.command('setMuted', isMuted);
  }

  public setLoop(isLooping: boolean): Promise<void> {
    return this.command('setLoop', isLooping);
  }

  /**
   * Resolves once the recording is ready; rejects with the failure.
   */
  public load(request: LoadRequest): Promise<void> {
    return this.command('load', withAbsoluteUrls(request, this.pageUrl()));
  }

  public async getState(): Promise<EmbedState> {
    const state = await this.command<EmbedState>('getState');
    this.stateValue = state;
    return state;
  }

  /**
   * The frame's document finished loading (its `load` event): its hello is due.
   */
  public frameLoaded(): void {
    if (!this.isDestroyed) this.helloWatch.loaded();
  }

  /**
   * Fails every command still waiting and stops listening; the caller removes the frame.
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.helloWatch.cancel();
    this.stopReceiving();
    for (const { reject } of this.pending.values()) {
      reject(new GyroViewError('embed-destroyed', 'the embed was destroyed'));
    }
    this.pending.clear();
    this.events.removeAll();
  }

  private command<Value = void>(name: CommandName, ...parameters: unknown[]): Promise<Value> {
    if (this.isDestroyed) {
      return Promise.reject(new GyroViewError('embed-destroyed', 'the embed was destroyed'));
    }
    if (this.unreachable) return Promise.reject(this.unreachable);
    const id = this.nextId;
    this.nextId += 1;
    const oldestUnanswered = this.pending.keys().next().value ?? id;
    const message = { ...commandMessage(id, name, parameters), oldestUnanswered };
    return new Promise<Value>((resolve, reject) => {
      this.pending.set(id, {
        message,
        resolve: (value): void => {
          resolve(value as Value);
        },
        reject,
      });
      if (this.isConnected) this.send(id);
    });
  }

  /**
   * Sends a command still waiting. One whose arguments the channel cannot carry (a URL object, a
   * function) is refused as a bad argument and forgotten, and the others still go.
   */
  private send(id: number): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    try {
      this.endpoint.send(pending.message);
    } catch (error) {
      this.pending.delete(id);
      const refusal = `embed command arguments cannot be sent to the frame: ${messageOf(error)}`;
      pending.reject(new GyroViewError('invalid-argument', refusal, { cause: error }));
    }
  }

  private onMessage(message: ProtocolMessage): void {
    switch (message.kind) {
      case 'hello': {
        // Trusted as the state it claims to be, as event details are (ADR 0010); an older frame
        // sends none, or one without the newer fields, which keep their defaults.
        if (message.state !== undefined) {
          this.stateValue = { ...INITIAL_STATE, ...(message.state as Partial<EmbedState>) };
        }
        this.isConnected = true;
        this.unreachable = undefined;
        this.helloWatch.heard();
        for (const id of this.pending.keys()) this.send(id);
        break;
      }
      case 'result': {
        this.settle(message);
        break;
      }
      case 'event': {
        this.onEvent(message);
        break;
      }
      case 'command': {
        break;
      }
    }
  }

  /**
   * The detail is the frame's: its origin is pinned and the message's shape and event name are
   * checked, so the payload is trusted to be that event's (ADR 0010).
   */
  private onEvent(message: EventMessage): void {
    const detail = detailOf(message);
    this.stateValue = stateAfter(this.stateValue, message.name, detail);
    this.events.emit(message.name, detail);
  }

  /**
   * The frame loaded and never said hello: nothing sent to it will be answered.
   */
  private giveUp(): void {
    this.unreachable = new GyroViewError(
      'embed-unreachable',
      'the embed frame loaded but never answered: check embedPageUrl, that its host lets other ' +
        'sites frame it (X-Frame-Options, frame-ancestors), and that this page has an origin',
    );
    for (const { reject } of this.pending.values()) reject(this.unreachable);
    this.pending.clear();
  }

  private settle(result: ResultMessage): void {
    const pending = this.pending.get(result.id);
    if (!pending) return;
    this.pending.delete(result.id);
    if (result.isOk) pending.resolve(result.value);
    else pending.reject(errorFrom(result.error));
  }
}

/**
 * An error crosses the channel as its code and message; the page hears it as the player's, so a
 * page choosing a fallback by its category can (ADR 0030).
 */
function detailOf(message: EventMessage): EmbedEvents[ForwardedEventName] {
  return message.name === 'error'
    ? errorFrom(message.detail as SerializedError)
    : (message.detail as EmbedEvents[ForwardedEventName]);
}

function errorFrom(error: SerializedError): GyroViewError {
  const code = isGyroViewErrorCode(error.code) ? error.code : 'invariant-violation';
  return new GyroViewError(code, error.message);
}

type StateUpdaters = {
  readonly [Name in ForwardedEventName]?: (
    state: EmbedState,
    detail: EmbedEvents[Name],
  ) => EmbedState;
};

/**
 * No recording is loaded, or the one loading is not ready yet.
 */
function hasNoRecording(status: PlayerStatus): status is 'idle' | 'loading' {
  return status === 'idle' || status === 'loading';
}

/**
 * A player is under way, as a media element that is not `paused`, once loaded and flowing.
 */
function isFlowingStatus(status: PlayerStatus): boolean {
  return !hasNoRecording(status) && isFlowing(status);
}

/**
 * What the mirror says of a recording while there is none: a failed or later load must not
 * leave the previous one's metadata and times behind.
 */
const NO_RECORDING: Pick<EmbedState, 'metadata' | 'duration' | 'currentTime'> = {
  metadata: undefined,
  duration: 0,
  currentTime: 0,
};

function withStatus(state: EmbedState, status: PlayerStatus): EmbedState {
  const recording = hasNoRecording(status) ? NO_RECORDING : {};
  return { ...state, ...recording, status, isPaused: !isFlowingStatus(status) };
}

function withTime(state: EmbedState, currentTime: number): EmbedState {
  return { ...state, currentTime };
}

/**
 * How each event moves the mirror: status, time, view, view mode, motion look, stabilization and
 * sound follow their events, the metadata arrives with `ready` and leaves with the next load.
 */
const STATE_UPDATERS: StateUpdaters = {
  statuschange: withStatus,
  timeupdate: withTime,
  seeking: withTime,
  seeked: withTime,
  ready: (state, metadata) => ({ ...state, metadata, duration: metadata.duration }),
  viewchange: (state, view) => ({ ...state, view }),
  viewmodechange: (state, viewMode) => ({ ...state, viewMode }),
  motionlookchange: (state, motionLook) => ({ ...state, motionLook }),
  volumechange: (state, sound) => ({ ...state, volume: sound.volume, isMuted: sound.isMuted }),
  stabilizationchange: (state, stabilization) => ({ ...state, stabilization }),
  qualitychange: (state, quality) => ({ ...state, quality }),
};

function stateAfter<Name extends ForwardedEventName>(
  state: EmbedState,
  name: Name,
  detail: EmbedEvents[Name],
): EmbedState {
  const update = STATE_UPDATERS[name];
  return update ? update(state, detail) : state;
}
