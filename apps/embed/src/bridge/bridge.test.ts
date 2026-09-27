import { defineGyroView, type GyroViewElement } from '@gyroview/player';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { portEndpoint, windowEndpoint } from './Endpoint';
import { EmbedHandle } from './EmbedHandle';
import { EmbedHost } from '../frame/EmbedHost';
import {
  commandMessage,
  eventMessage,
  helloMessage,
  PROTOCOL,
  type ProtocolMessage,
} from '../protocol/messages';
import { waitFor } from '../test/waiting';
import recordingUrl from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';

beforeAll(() => {
  defineGyroView();
});

interface Bridge {
  readonly element: GyroViewElement;
  readonly host: EmbedHost;
  readonly handle: EmbedHandle;
}

describe('the embed bridge over a message channel', () => {
  const bridges: Bridge[] = [];

  /**
   * An element configured by `attributes` before the host starts, as the embed page does it.
   */
  function bridge(attributes: Record<string, string> = {}): Bridge {
    const element = document.createElement('gyro-view') as GyroViewElement;
    element.style.width = '256px';
    element.style.height = '128px';
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    document.body.append(element);
    const channel = new MessageChannel();
    const handle = new EmbedHandle(portEndpoint(channel.port2), () => location.href);
    const host = new EmbedHost(element, portEndpoint(channel.port1));
    const created = { element, host, handle };
    bridges.push(created);
    return created;
  }

  afterEach(() => {
    for (const { element, host, handle } of bridges.splice(0)) {
      handle.destroy();
      host.dispose();
      element.remove();
    }
  });

  it('refuses a command the channel cannot carry, before the hello, and still sends the rest', async () => {
    const { handle } = bridge();
    const uncloneable = handle.load({
      src: new URL('clip.insv', location.href) as unknown as string,
    });
    const pausing = handle.pause();
    await expect(uncloneable).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(pausing).resolves.toBeUndefined();
  });

  it('refuses a command the channel cannot carry once connected, and answers the next', async () => {
    const { handle } = bridge();
    await handle.getState();
    await expect(
      handle.load({ src: new URL('clip.insv', location.href) as unknown as string }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(handle.pause()).resolves.toBeUndefined();
  });

  it('starts its mirror from the settings the frame was configured with', async () => {
    const { handle } = bridge({ yaw: '45', 'view-mode': 'equirectangular', stabilization: 'off' });
    await waitFor(() => handle.state.viewMode === 'equirectangular', 'the hello');
    expect(handle.state.view.yaw).toBe(45);
    expect(handle.state.stabilization).toBe('off');
  });

  it('loads over the channel, reports the metadata and the state, and forgets them on a failed load', async () => {
    const { handle, element } = bridge();
    const ready = new Promise<unknown>((resolve) => {
      handle.events.on('ready', resolve);
    });
    await handle.load({ src: recordingUrl });
    expect(element.src).toBe(new URL(recordingUrl, location.href).href);
    const metadata = (await ready) as { model: string };
    expect(metadata.model).toBe('Insta360 X5');
    expect(handle.state.status).toBe('ready');
    expect(handle.state.duration).toBeCloseTo(3, 1);

    await expect(handle.load({ src: `${recordingUrl}.missing` })).rejects.toMatchObject({
      code: 'source-unreadable',
    });
    expect(handle.state).toMatchObject({ status: 'error', metadata: undefined, duration: 0 });
  });

  it('plays, pauses and seeks over the channel and forwards the transport events', async () => {
    const { handle } = bridge();
    const heard: string[] = [];
    for (const name of ['play', 'pause', 'seeking', 'seeked'] as const) {
      handle.events.on(name, () => {
        heard.push(name);
      });
    }
    await handle.load({ src: recordingUrl });
    await handle.play();
    await waitFor(() => handle.state.status === 'playing', 'playing');
    await handle.pause();
    await handle.seek(2);
    const state = await handle.getState();
    expect(state.currentTime).toBe(2);
    expect(state.isPaused).toBe(true);
    expect(heard).toEqual(['play', 'pause', 'seeking', 'seeked']);
  });

  it('unloads the frame on a load of a blank source', async () => {
    const { handle, element } = bridge();
    await handle.load({ src: recordingUrl });
    await handle.load({ src: '' });
    expect(element.hasAttribute('src') && element.getAttribute('src') !== '').toBe(false);
    await waitFor(() => handle.state.status === 'idle', 'the unload');
  });

  it('changes the view, view mode, stabilization and loop over the channel, reading choices as the element does', async () => {
    const { handle, element } = bridge();
    await handle.lookAt(30, 10);
    await handle.zoom(1);
    await handle.setStabilization(' Horizon');
    await handle.setViewMode('equirectangular');
    await handle.setLoop(true);
    expect(handle.state.view).toMatchObject({ yaw: 30, pitch: 10 });
    expect(handle.state.view.fieldOfView).toBeLessThan(90);
    expect(handle.state.stabilization).toBe('horizon');
    expect(handle.state.viewMode).toBe('equirectangular');
    expect(element.loop).toBe(true);
    const state = await handle.getState();
    expect(state.viewMode).toBe('equirectangular');
  });

  it('mirrors the sound as the player changes it', async () => {
    const { handle } = bridge();
    await handle.setMuted(true);
    await handle.setVolume(0.25);
    await waitFor(() => handle.state.isMuted && handle.state.volume === 0.25, 'the sound mirrored');
    const state = await handle.getState();
    expect(state).toMatchObject({ isMuted: true, volume: 0.25 });
  });

  it('reports the settings in effect though no attribute names them', async () => {
    const { handle } = bridge();
    const state = await handle.getState();
    expect(state.stabilization).toBe('lock');
    expect(state.viewMode).toBe('normal');
  });

  it('rejects a command with a bad argument without breaking the others', async () => {
    const { handle, element } = bridge();
    await expect(handle.seek(NaN)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'embed command argument 0 must be a finite number',
    });
    await expect(handle.setStabilization('wobble')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(handle.setViewMode('stereographic')).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'embed command argument 0 must be one of normal, equirectangular, raw-lenses',
    });
    await expect(handle.load({ src: 5 as unknown as string })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(handle.load(null as unknown as { src: string })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'embed command argument 0 must be an object',
    });
    const badSecond = { src: 'a.insv', src2: 7 } as unknown as { src: string };
    await expect(handle.load(badSecond)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'embed command argument 0.src2 must be a string',
    });
    await handle.resetView();
    expect(element.view.yaw).toBe(0);
  });

  it('forwards errors as plain data and fails pending commands when destroyed', async () => {
    const { handle } = bridge();
    const failure = new Promise<unknown>((resolve) => {
      handle.events.on('error', resolve);
    });
    await expect(handle.load({ src: `${recordingUrl}.missing` })).rejects.toMatchObject({
      code: 'source-unreadable',
    });
    expect(await failure).toEqual({
      code: 'source-unreadable',
      message: expect.stringContaining('.missing') as string,
    });
    expect(handle.state.status).toBe('error');

    const dangling = handle.getState();
    handle.destroy();
    await expect(dangling).rejects.toMatchObject({ code: 'embed-destroyed' });
    await expect(handle.play()).rejects.toMatchObject({ code: 'embed-destroyed' });
  });

  it('queues commands until the frame says hello, even an older frame that sends no state', async () => {
    const channel = new MessageChannel();
    const handle = new EmbedHandle(portEndpoint(channel.port2), () => location.href);
    const received: ProtocolMessage[] = [];
    const hostSide = portEndpoint(channel.port1);
    hostSide.receive((message) => {
      received.push(message);
    });

    const pausing = handle.pause();
    // The channel keeps order: a command sent at once would arrive before this marker.
    const marker = eventMessage('warning', 'marker');
    channel.port2.postMessage(marker);
    await waitFor(() => received.length === 1, 'the marker');
    expect(received).toEqual([marker]);

    hostSide.send({ protocol: PROTOCOL, kind: 'hello' });
    await waitFor(() => received.length === 2, 'the queued command');
    expect(received[1]).toMatchObject({ kind: 'command', name: 'pause', id: 1 });
    expect(handle.state.status).toBe('idle');
    hostSide.send({ protocol: PROTOCOL, kind: 'result', id: 1, isOk: true, value: undefined });
    await pausing;
    handle.destroy();
  });

  it('forgets a command the channel could not carry, so the frame may forget what it answered', async () => {
    const channel = new MessageChannel();
    const handle = new EmbedHandle(portEndpoint(channel.port2), () => location.href);
    const received: ProtocolMessage[] = [];
    const hostSide = portEndpoint(channel.port1);
    hostSide.receive((message) => {
      received.push(message);
    });
    hostSide.send(helloMessage({ status: 'ready' }));
    await waitFor(() => handle.state.status === 'ready', 'the hello');

    await expect(
      handle.load({ src: new URL('clip.insv', location.href) as unknown as string }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const pausing = handle.pause();
    await waitFor(() => received.length === 1, 'the next command');
    expect(received[0]).toMatchObject({ name: 'pause', id: 2, oldestUnanswered: 2 });
    handle.destroy();
    await expect(pausing).rejects.toMatchObject({ code: 'embed-destroyed' });
  });
});

describe('an embed handle whose frame loads anew', () => {
  it('asks the new frame what the old one never answered, and mirrors its state', async () => {
    const channel = new MessageChannel();
    const handle = new EmbedHandle(portEndpoint(channel.port2), () => location.href);
    const received: ProtocolMessage[] = [];
    const hostSide = portEndpoint(channel.port1);
    hostSide.receive((message) => {
      received.push(message);
    });
    hostSide.send(helloMessage({}));
    const pausing = handle.pause();
    await waitFor(() => received.length === 1, 'the command');

    const reloadedState = { status: 'ready', currentTime: 0, duration: 3 };
    hostSide.send(helloMessage(reloadedState));
    await waitFor(() => received.length === 2, 'the command asked again');
    expect(received[1]).toEqual(received[0]);
    expect(received[1]).toMatchObject({ id: 1, oldestUnanswered: 1 });
    expect(handle.state).toEqual(reloadedState);
    hostSide.send({ protocol: PROTOCOL, kind: 'result', id: 1, isOk: true, value: undefined });
    await pausing;
    handle.destroy();
  });
});

describe('an embed host asked again', () => {
  it('remembers only the commands the page may still ask again', async () => {
    const element = document.createElement('gyro-view') as GyroViewElement;
    document.body.append(element);
    const channel = new MessageChannel();
    const host = new EmbedHost(element, portEndpoint(channel.port1));
    const pageSide = portEndpoint(channel.port2);
    const results: number[] = [];
    pageSide.receive((message) => {
      if (message.kind === 'result') results.push(message.id);
    });
    const first = { ...commandMessage(1, 'getState', []), oldestUnanswered: 1 };
    const second = { ...commandMessage(2, 'getState', []), oldestUnanswered: 2 };
    for (const message of [first, second, second, first]) pageSide.send(message);
    pageSide.send(commandMessage(3, 'getState', []));
    await waitFor(() => results.includes(3), 'the last result');
    // The second is still remembered and runs once; the first was forgotten, so it runs again.
    expect(results.toSorted((a, b) => a - b)).toEqual([1, 1, 2, 3]);
    host.dispose();
    element.remove();
  });

  it('runs a command it hears twice only once', async () => {
    const element = document.createElement('gyro-view') as GyroViewElement;
    document.body.append(element);
    const channel = new MessageChannel();
    const host = new EmbedHost(element, portEndpoint(channel.port1));
    const pageSide = portEndpoint(channel.port2);
    const results: ProtocolMessage[] = [];
    pageSide.receive((message) => {
      if (message.kind === 'result') results.push(message);
    });
    const zoomIn = commandMessage(1, 'zoom', [1]);
    pageSide.send(zoomIn);
    pageSide.send(zoomIn);
    pageSide.send(commandMessage(2, 'getState', []));
    await waitFor(
      () => results.some((result) => result.kind === 'result' && result.id === 2),
      'the last result',
    );
    expect(results.filter((result) => result.kind === 'result' && result.id === 1)).toHaveLength(1);
    host.dispose();
    element.remove();
  });
});

describe('windowEndpoint', () => {
  it("delivers protocol messages from its peer's window and origin only, ignoring other data", async () => {
    // A window posting to itself is its own message source.
    const page = globalThis as Window & typeof globalThis;
    const trusted = windowEndpoint({
      peer: () => page,
      peerOrigin: location.origin,
      listenOn: page,
    });
    const distrustful = windowEndpoint({
      peer: () => page,
      peerOrigin: 'https://someone-else.example',
      listenOn: page,
    });
    const heardByTrusted: ProtocolMessage[] = [];
    const heardByDistrustful: ProtocolMessage[] = [];
    const stopTrusted = trusted.receive((message) => {
      heardByTrusted.push(message);
    });
    const stopDistrustful = distrustful.receive((message) => {
      heardByDistrustful.push(message);
    });

    // Messages arrive in order: once the hello is heard, the unrelated data before it was too,
    // and the distrustful endpoint heard the hello in the same dispatch.
    page.postMessage({ unrelated: true }, location.origin);
    trusted.send(helloMessage({}));
    await waitFor(() => heardByTrusted.length === 1, 'the hello');

    expect(heardByTrusted).toEqual([helloMessage({})]);
    expect(heardByDistrustful).toEqual([]);
    stopTrusted();
    stopDistrustful();
  });
});
