import { BrowserAttitudeSensor } from './composition/BrowserAttitudeSensor';
import { browserPorts, type BrowserPortsOptions } from './composition/browserPorts';
import { buildPipeline } from './composition/buildPipeline';
import type { PipelineHost } from './composition/ports';
import { Player } from './player/Player';

/**
 * A player composed for a browser: HTTP, blob and WebCodecs ports, the GPU pipeline and the
 * device's attitude, drawing on the host's canvas and sounding through its audio element. What
 * `<gyro-view>` plays with, and where a page that wants the player without the element starts.
 */
export function createBrowserPlayer(host: PipelineHost, options?: BrowserPortsOptions): Player {
  return new Player({
    host,
    ports: browserPorts(options),
    pipelines: buildPipeline,
    attitude: new BrowserAttitudeSensor(),
  });
}
