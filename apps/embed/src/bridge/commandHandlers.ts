import { GyroViewError, type StabilizationMode } from '@gyroview/core';
import type { GyroViewElement } from '@gyroview/player';

import type { EmbedState, LoadRequest } from './EmbedState';
import type { CommandName } from '../protocol/messages';

type Handler = (element: GyroViewElement, parameters: readonly unknown[]) => unknown;

const STABILIZATION_MODES: readonly StabilizationMode[] = ['off', 'lock', 'horizon', 'follow'];
const LOAD_ATTRIBUTES = ['src', 'src2', 'proxy', 'quality'] as const;

function invalid(what: string): GyroViewError {
  return new GyroViewError('invariant-violation', `embed command argument ${what}`);
}

function numberAt(parameters: readonly unknown[], index: number): number {
  const value = parameters[index];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw invalid(`${index} must be a finite number`);
  return value;
}

function isFlagAt(parameters: readonly unknown[], index: number): boolean {
  const value = parameters[index];
  if (typeof value !== 'boolean') throw invalid(`${index} must be a boolean`);
  return value;
}

function stabilizationAt(parameters: readonly unknown[]): StabilizationMode {
  const value = parameters[0];
  const mode = STABILIZATION_MODES.find((candidate) => candidate === value);
  if (!mode) throw invalid(`0 must be one of ${STABILIZATION_MODES.join(', ')}`);
  return mode;
}

function loadRequestAt(parameters: readonly unknown[]): LoadRequest {
  const value = parameters[0];
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as LoadRequest).src !== 'string'
  ) {
    throw invalid('0 must be an object with a src string');
  }
  return value as LoadRequest;
}

export function stateOf(element: GyroViewElement): EmbedState {
  return {
    status: element.status,
    currentTime: element.currentTime,
    duration: element.duration,
    isPaused: element.paused,
    view: element.view,
    stabilization: element.stabilization as StabilizationMode,
    metadata: element.metadata,
  };
}

function load(element: GyroViewElement, request: LoadRequest): void {
  for (const name of LOAD_ATTRIBUTES) writeAttribute(element, name, request[name]);
}

function writeAttribute(element: Element, name: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

/**
 * What each command does to the element. Arguments arrive from another origin and are checked
 * before use; a bad one fails that command only.
 */
export const COMMAND_HANDLERS: Readonly<Record<CommandName, Handler>> = {
  play: (element): Promise<void> => element.play(),
  pause: (element): void => {
    element.pause();
  },
  stop: (element): void => {
    element.stop();
  },
  seek: (element, parameters): void => {
    element.seek(numberAt(parameters, 0));
  },
  lookAt: (element, parameters): void => {
    element.lookAt(numberAt(parameters, 0), numberAt(parameters, 1));
  },
  resetView: (element): void => {
    element.resetView();
  },
  zoom: (element, parameters): void => {
    element.zoom(numberAt(parameters, 0));
  },
  setStabilization: (element, parameters): void => {
    element.setStabilization(stabilizationAt(parameters));
  },
  setVolume: (element, parameters): void => {
    element.volume = numberAt(parameters, 0);
  },
  setMuted: (element, parameters): void => {
    element.muted = isFlagAt(parameters, 0);
  },
  setLoop: (element, parameters): void => {
    element.loop = isFlagAt(parameters, 0);
  },
  load: (element, parameters): void => {
    load(element, loadRequestAt(parameters));
  },
  getState: stateOf,
};
