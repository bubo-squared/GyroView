import { BT709_LUMINANCE, type Vector3 } from '@gyroview/core';

const RGBA = 4;
/**
 * Every second pixel of every second row: a panorama's statistics do not need all of them.
 */
const STRIDE = 2;
const TENTH = 0.1;
const MEDIAN = 0.5;
const NINETIETH = 0.9;
const NINETY_NINTH = 0.99;
const PERCENTILES = [TENTH, MEDIAN, NINETIETH, NINETY_NINTH] as const;
/**
 * A row's latitude from its centre, the equator halfway down.
 */
const PIXEL_CENTRE = 0.5;
const EQUATOR = 0.5;

/**
 * An equirectangular panorama's colour over the whole sphere, each pixel weighted by the area it
 * covers, so that no turn of the panorama changes it and two panoramas of one moment compare
 * without being aligned; in levels of 255.
 */
export interface ColourStatistics {
  readonly meanRgb: Vector3;
  /**
   * The mean spread between a pixel's strongest and weakest channel.
   */
  readonly saturation: number;
  /**
   * BT.709 luma at the 10th, 50th, 90th and 99th percentile.
   */
  readonly lumaPercentiles: readonly number[];
}

interface WeightedLuma {
  readonly luma: number;
  readonly weight: number;
}

/**
 * The statistics of RGBA pixels, row by row; which way the rows run does not matter, since the
 * two hemispheres weigh alike.
 */
export function colourStatisticsOf(
  pixels: Uint8ClampedArray,
  size: { readonly width: number; readonly height: number },
): ColourStatistics {
  const samples = weightedSamplesOf(pixels, size);
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const meanOf = (value: (rgb: Vector3) => number): number =>
    samples.reduce((sum, sample) => sum + sample.weight * value(sample.rgb), 0) / total;
  return {
    meanRgb: [meanOf((rgb) => rgb[0]), meanOf((rgb) => rgb[1]), meanOf((rgb) => rgb[2])],
    saturation: meanOf((rgb) => Math.max(...rgb) - Math.min(...rgb)),
    lumaPercentiles: weightedPercentilesOf(
      samples.map((sample) => ({ luma: lumaOf(sample.rgb), weight: sample.weight })),
      total,
    ),
  };
}

interface WeightedSample {
  readonly rgb: Vector3;
  readonly weight: number;
}

/**
 * Every sampled pixel, weighted by the area its row covers on the sphere.
 */
function weightedSamplesOf(
  pixels: Uint8ClampedArray,
  size: { readonly width: number; readonly height: number },
): WeightedSample[] {
  const samples: WeightedSample[] = [];
  for (let row = 0; row < size.height; row += STRIDE) {
    const weight = Math.cos(((row + PIXEL_CENTRE) / size.height - EQUATOR) * Math.PI);
    for (let column = 0; column < size.width; column += STRIDE) {
      const offset = (row * size.width + column) * RGBA;
      const rgb: Vector3 = [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
      samples.push({ rgb, weight });
    }
  }
  return samples;
}

function lumaOf([red, green, blue]: Vector3): number {
  return BT709_LUMINANCE[0] * red + BT709_LUMINANCE[1] * green + BT709_LUMINANCE[2] * blue;
}

function weightedPercentilesOf(lumas: readonly WeightedLuma[], total: number): number[] {
  const sorted = lumas.toSorted((left, right) => left.luma - right.luma);
  return PERCENTILES.map((percentile) => {
    let covered = 0;
    const reached = sorted.find((entry) => {
      covered += entry.weight;
      return covered >= percentile * total;
    });
    return reached?.luma ?? NaN;
  });
}
