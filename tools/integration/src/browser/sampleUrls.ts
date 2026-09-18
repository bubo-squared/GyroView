/**
 * The local sample recordings as the Vite dev server exposes them. Vite rewrites these URLs to
 * its `/@fs/` form when the files exist; otherwise they stay unresolved and the tests skip.
 */
export interface SampleRecording {
  readonly name: string;
  readonly url: string;
  readonly frameRate: number;
  readonly codedSize: number;
}

export const OFFICE_5K7_60: SampleRecording = {
  name: 'office (X5, 5.7K60)',
  url: new URL('../../../../samples/office/VID_20260814_132640_00_013.insv', import.meta.url).href,
  frameRate: 59.94,
  codedSize: 2880,
};

export const SAILING_8K_30: SampleRecording = {
  name: 'sailing (X5, 8K30)',
  url: new URL('../../../../samples/sailing/VID_20260918_082915_00_014.insv', import.meta.url).href,
  frameRate: 29.97,
  codedSize: 3840,
};

export async function isServed(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
