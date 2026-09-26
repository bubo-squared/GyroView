import {
  DEFAULT_STABILIZATION_MODE,
  DEFAULT_VIEW,
  DEFAULT_VIEW_MODE,
  GyroViewError,
  isFlowing,
  isGyroViewErrorCode,
  TypedEmitter,
} from '@gyroview/core';
import type { PlayerStatus } from '@gyroview/player';

import type { Endpoint } from './Endpoint';
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
  view: DEFAULT_VIEW,
  viewMode: DEFAULT_VIEW_MODE,
  stabilization: DEFAULT_STABILIZATION_MODE,
  metadata: undefined,
};

/**
 * The embedding page's side of the bridge: the player API as promises over the channel, the
 * player's events, and a state mirror kept current from them. Commands sent before the frame
 * says hello wait for it.
 */
export class EmbedHandle {
  public readonly events = new TypedEmitter<EmbedEvents>();
  private readonly pending = new Map<number, PendingCommand>();
  private readonly queued: ProtocolMessage[] = [];
  private readonly stopReceiving: () => void;
  private stateValue: EmbedState = INITIAL_STATE;
  private nextId = 1;
  private isConnected = false;
  private isDestroyed = false;

  public constructor(private readonly endpoint: Endpoint) {
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
    return this.command('load', request);
  }

  public async getState(): Promise<EmbedState> {
    const state = await this.command<EmbedState>('getState');
    this.stateValue = state;
    return state;
  }

  /**
   * Fails every command still waiting and stops listening; the caller removes the frame.
   */
  public destroy(): void {
    this.isDestroyed = true;
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
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<Value>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value): void => {
          resolve(value as Value);
        },
        reject,
      });
      this.deliver(commandMessage(id, name, parameters));
    });
  }

  private deliver(message: ProtocolMessage): void {
    if (this.isConnected) this.endpoint.send(message);
    else this.queued.push(message);
  }

  private onMessage(message: ProtocolMessage): void {
    switch (message.kind) {
      case 'hello': {
        // Trusted as the state it claims to be, as event details are (ADR 0010); an older frame
        // sends none, and the mirror keeps the defaults.
        if (message.state !== undefined) this.stateValue = message.state as EmbedState;
        this.isConnected = true;
        for (const queued of this.queued.splice(0)) this.endpoint.send(queued);
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
    const detail = message.detail as EmbedEvents[ForwardedEventName];
    this.stateValue = stateAfter(this.stateValue, message.name, detail);
    this.events.emit(message.name, detail);
  }

  private settle(result: ResultMessage): void {
    const pending = this.pending.get(result.id);
    if (!pending) return;
    this.pending.delete(result.id);
    if (result.isOk) pending.resolve(result.value);
    else pending.reject(errorFrom(result.error));
  }
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
 * How each event moves the mirror: status, time, view, view mode, stabilization and sound follow
 * their events, the metadata arrives with `ready` and leaves with the next load.
 */
const STATE_UPDATERS: StateUpdaters = {
  statuschange: withStatus,
  timeupdate: withTime,
  seeking: withTime,
  seeked: withTime,
  ready: (state, metadata) => ({ ...state, metadata, duration: metadata.duration }),
  viewchange: (state, view) => ({ ...state, view }),
  viewmodechange: (state, viewMode) => ({ ...state, viewMode }),
  volumechange: (state, sound) => ({ ...state, volume: sound.volume, isMuted: sound.isMuted }),
  stabilizationchange: (state, stabilization) => ({ ...state, stabilization }),
};

function stateAfter<Name extends ForwardedEventName>(
  state: EmbedState,
  name: Name,
  detail: EmbedEvents[Name],
): EmbedState {
  const update = STATE_UPDATERS[name];
  return update ? update(state, detail) : state;
}
