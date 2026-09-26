import { GyroViewError, STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';
import { choiceOf, type GyroViewElement } from '@gyroview/player';
import { SourceAttribute } from '@gyroview/player/attributes';

import type { EmbedState, LoadRequest } from '../bridge/EmbedState';
import type { CommandName } from '../protocol/messages';

type Handler = (element: GyroViewElement, parameters: readonly unknown[]) => unknown;

/**
 * A load names a new source: every source attribute, absent ones removed.
 */
const LOAD_ATTRIBUTES = Object.values(SourceAttribute);

function invalid(what: string): GyroViewError {
  return new GyroViewError('invalid-argument', `embed command argument ${what}`);
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

/**
 * A choice read as the element reads its attributes and properties, so a value the element
 * accepts is accepted here too.
 */
function choiceAt<Choice extends string>(
  parameters: readonly unknown[],
  choices: readonly Choice[],
): Choice {
  const value = parameters[0];
  const choice = typeof value === 'string' ? choiceOf(value, choices) : undefined;
  if (!choice) throw invalid(`0 must be one of ${choices.join(', ')}`);
  return choice;
}

function loadRequestAt(parameters: readonly unknown[]): LoadRequest {
  const value = parameters[0];
  if (typeof value !== 'object' || value === null) throw invalid('0 must be an object');
  const { src, src2 } = value as Partial<Record<keyof LoadRequest, unknown>>;
  if (typeof src !== 'string') throw invalid('0.src must be a string');
  if (src2 === undefined) return { src };
  if (typeof src2 !== 'string') throw invalid('0.src2 must be a string');
  return { src, src2 };
}

export function stateOf(element: GyroViewElement): EmbedState {
  return {
    status: element.status,
    currentTime: element.currentTime,
    duration: element.duration,
    isPaused: element.paused,
    volume: element.volume,
    isMuted: element.muted,
    view: element.view,
    stabilization: element.stabilization,
    viewMode: element.viewMode,
    metadata: element.metadata,
  };
}

/**
 * Names the new source on the element and follows the load it causes to the end.
 */
function load(element: GyroViewElement, request: LoadRequest): Promise<void> {
  for (const name of LOAD_ATTRIBUTES) writeAttribute(element, name, request[name]);
  return element.load();
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
  scrub: (element, parameters): Promise<void> => element.scrub(numberAt(parameters, 0)),
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
    element.setStabilization(choiceAt(parameters, STABILIZATION_MODES));
  },
  setViewMode: (element, parameters): void => {
    element.setViewMode(choiceAt(parameters, VIEW_MODES));
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
  load: (element, parameters): Promise<void> => load(element, loadRequestAt(parameters)),
  getState: stateOf,
};
