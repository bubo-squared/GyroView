import {
  DEFAULT_STABILIZATION_MODE,
  DEFAULT_VIEW,
  DEFAULT_VIEW_MODE,
  GyroViewError,
  TypedEmitter,
  type GyroViewErrorCode,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';
import type { PlayerMetadata, PlayerStatus, SoundLevel } from '@gyroview/player';

import type { Endpoint } from './Endpoint';
import type { EmbedState, LoadRequest } from './EmbedState';
import {
  commandMessage,
  type CommandName,
  type ProtocolMessage,
  type ResultMessage,
  type SerializedError,
} from '../protocol/messages';

interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Events as the embedding page hears them: the player's, with errors as plain data.
 */
export interface EmbedEvents extends Record<string, unknown> {
  readonly statuschange: PlayerStatus;
  readonly ready: PlayerMetadata;
  readonly play: undefined;
  readonly playing: undefined;
  readonly waiting: undefined;
  readonly pause: undefined;
  readonly ended: undefined;
  readonly timeupdate: number;
  readonly seeking: number;
  readonly seeked: number;
  readonly viewchange: ViewState;
  readonly viewmodechange: ViewMode;
  readonly stabilizationchange: StabilizationMode;
  readonly volumechange: SoundLevel;
  readonly warning: string;
  readonly error: SerializedError;
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
      reject(new GyroViewError('invariant-violation', 'the embed was destroyed'));
    }
    this.pending.clear();
    this.events.removeAll();
  }

  private command<Value = void>(name: CommandName, ...parameters: unknown[]): Promise<Value> {
    if (this.isDestroyed) {
      return Promise.reject(new GyroViewError('invariant-violation', 'the embed was destroyed'));
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
        this.isConnected = true;
        for (const queued of this.queued.splice(0)) this.endpoint.send(queued);
        break;
      }
      case 'result': {
        this.settle(message);
        break;
      }
      case 'event': {
        this.stateValue = stateAfter(this.stateValue, message.name, message.detail);
        this.events.emit(message.name, message.detail);
        break;
      }
      case 'command': {
        break;
      }
    }
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
  return new GyroViewError(error.code as GyroViewErrorCode, error.message);
}

type StateUpdater = (state: EmbedState, detail: unknown) => EmbedState;

function withTime(state: EmbedState, detail: unknown): EmbedState {
  return { ...state, currentTime: detail as number };
}

/**
 * How each event moves the mirror: status, time, view, view mode, stabilization and sound follow
 * their events, the metadata arrives with `ready`.
 */
const STATE_UPDATERS: ReadonlyMap<string, StateUpdater> = new Map<string, StateUpdater>([
  [
    'statuschange',
    (state, detail): EmbedState => {
      const status = detail as EmbedState['status'];
      return { ...state, status, isPaused: status !== 'playing' && status !== 'buffering' };
    },
  ],
  ['timeupdate', withTime],
  ['seeking', withTime],
  ['seeked', withTime],
  [
    'ready',
    (state, detail): EmbedState => {
      const metadata = detail as NonNullable<EmbedState['metadata']>;
      return { ...state, metadata, duration: metadata.duration };
    },
  ],
  ['viewchange', (state, detail): EmbedState => ({ ...state, view: detail as EmbedState['view'] })],
  [
    'viewmodechange',
    (state, detail): EmbedState => ({ ...state, viewMode: detail as EmbedState['viewMode'] }),
  ],
  [
    'volumechange',
    (state, detail): EmbedState => {
      const sound = detail as SoundLevel;
      return { ...state, volume: sound.volume, isMuted: sound.isMuted };
    },
  ],
  [
    'stabilizationchange',
    (state, detail): EmbedState => ({
      ...state,
      stabilization: detail as EmbedState['stabilization'],
    }),
  ],
]);

function stateAfter(state: EmbedState, name: string, detail: unknown): EmbedState {
  return STATE_UPDATERS.get(name)?.(state, detail) ?? state;
}
