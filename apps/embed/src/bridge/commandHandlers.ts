import { GyroViewError, STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';
import type { GyroViewElement } from '@gyroview/player';
import { SourceAttribute } from '@gyroview/player/attributes';

import type { EmbedState, LoadRequest } from './EmbedState';
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

function choiceAt<Choice extends string>(
  parameters: readonly unknown[],
  choices: readonly Choice[],
): Choice {
  const value = parameters[0];
  const choice = choices.find((candidate) => candidate === value);
  if (!choice) throw invalid(`0 must be one of ${choices.join(', ')}`);
  return choice;
}

const OPTIONAL_LOAD_FIELDS = ['src2', 'proxy', 'quality'] as const;

type OptionalLoadFields = Partial<Record<(typeof OPTIONAL_LOAD_FIELDS)[number], string>>;

function loadRequestAt(parameters: readonly unknown[]): LoadRequest {
  const value = parameters[0];
  if (typeof value !== 'object' || value === null) throw invalid('0 must be an object');
  const request = value as Readonly<Record<string, unknown>>;
  if (typeof request['src'] !== 'string') throw invalid('0.src must be a string');
  return { src: request['src'], ...optionalLoadFieldsOf(request) };
}

function optionalLoadFieldsOf(request: Readonly<Record<string, unknown>>): OptionalLoadFields {
  const fields: OptionalLoadFields = {};
  for (const name of OPTIONAL_LOAD_FIELDS) {
    const field = request[name];
    if (field === undefined) continue;
    if (typeof field !== 'string') throw invalid(`0.${name} must be a string`);
    fields[name] = field;
  }
  return fields;
}

function stateOf(element: GyroViewElement): EmbedState {
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
