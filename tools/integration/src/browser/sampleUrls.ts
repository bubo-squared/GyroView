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

/**
 * The office recording's low-resolution proxy: one packed H.264 track holding both lenses.
 */
export const OFFICE_PROXY: SampleRecording = {
  name: 'office proxy (X5 LRV, packed)',
  url: new URL('../../../../samples/office/LRV_20260814_132640_01_013.lrv', import.meta.url).href,
  frameRate: 30,
  codedSize: 832,
};

export const SAILING_8K_30: SampleRecording = {
  name: 'sailing (X5, 8K30)',
  url: new URL('../../../../samples/sailing/VID_20260918_082915_00_014.insv', import.meta.url).href,
  frameRate: 29.97,
  codedSize: 3840,
};

/**
 * A second recording of the sailing camera unit: what a correction estimated per unit must
 * find again here.
 */
export const KRNJACA_8K_30: SampleRecording = {
  name: 'krnjaca (X5, 8K30)',
  url: new URL('../../../../samples/krnjaca-c2/VID_20260514_131639_00_004.insv', import.meta.url)
    .href,
  frameRate: 29.97,
  codedSize: 3840,
};

/**
 * An X3 recording split into its two lens files, H.264, upright on a tripod; the player
 * finds the other lens's file beside this one.
 */
export const X3_5K7_30: SampleRecording = {
  name: 'X3 (5.7K30, split files)',
  url: new URL(
    '../../../../samples/insta360 x3 samples/VID_20231218_150323_00_022.insv',
    import.meta.url,
  ).href,
  frameRate: 29.97,
  codedSize: 2880,
};

export async function isServed(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
