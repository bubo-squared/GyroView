import { describe, expect, it } from 'vitest';

import { buildStitchingSetup, DEFAULT_FEATHER, lensFrameOrder } from './StitchingSetup';
import {
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type LensLayout,
} from '../../domain/format/layout/LensLayout';
import { parseOffsetString } from '../../domain/optics/parseOffsetString';
import { transformVector } from '../../shared/math/Matrix3';
import { captureError } from '../../../test/support/errors';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const MULTI_TRACK: LensLayout = {
  kind: 'multi-track',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 1, region: FULL_FRAME },
    { lensIndex: 1, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
  ],
  evidence: [],
};

const PACKED: LensLayout = {
  kind: 'packed',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: LEFT_HALF },
    { lensIndex: 1, inputIndex: 0, trackIndex: 0, region: RIGHT_HALF },
  ],
  evidence: [],
};

const X5_CROP = {
  sensorWidth: 5376,
  sensorHeight: 5376,
  cropWidth: 5312,
  cropHeight: 5312,
  cropOffsetX: 0,
  cropOffsetY: 0,
};

/**
 * A sensor half the canvas resolution with an off-centre window, as another camera might report.
 */
const HALF_RESOLUTION_CROP = {
  sensorWidth: 2688,
  sensorHeight: 2688,
  cropWidth: 2656,
  cropHeight: 2640,
  cropOffsetX: 16,
  cropOffsetY: 8,
};

const SPLIT_FILES: LensLayout = {
  kind: 'split-files',
  sources: [
    { lensIndex: 0, inputIndex: 0, trackIndex: 0, region: FULL_FRAME },
    { lensIndex: 1, inputIndex: 1, trackIndex: 0, region: FULL_FRAME },
  ],
  evidence: [],
};

describe('lensFrameOrder', () => {
  it('lists one frame per distinct track in lens order', () => {
    expect(lensFrameOrder(MULTI_TRACK)).toEqual([
      { inputIndex: 0, trackIndex: 1 },
      { inputIndex: 0, trackIndex: 0 },
    ]);
  });

  it('collapses a packed layout onto one frame', () => {
    expect(lensFrameOrder(PACKED)).toEqual([{ inputIndex: 0, trackIndex: 0 }]);
  });
});

describe('buildStitchingSetup', () => {
  const calibration = parseOffsetString(OFFICE_CALIBRATION.offsetV3);

  it('maps each lens onto its frame, canvas square and sensor window', () => {
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK, windowCrop: X5_CROP });
    expect(setup.frameCount).toBe(2);
    expect(setup.feather).toBe(DEFAULT_FEATHER);
    expect(setup.lenses.map((lens) => [lens.lensIndex, lens.frameIndex])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(setup.lenses[0]?.window).toEqual({ x: 0, y: 0, width: 5312, height: 5312 });
    expect(setup.lenses[1]?.window).toEqual({ x: 5376, y: 0, width: 5312, height: 5312 });
    expect(setup.lenses[0]?.projection.kind).toBe('mei');
    const backLens = setup.lenses[1];
    if (!backLens) throw new Error('no second lens');
    const forwardInLens = transformVector(backLens.rotation, [0, 0, -1]);
    expect(forwardInLens[2]).toBeCloseTo(1, 2);
  });

  it('scales an off-centre sensor window onto the canvas square', () => {
    const setup = buildStitchingSetup({
      calibration,
      layout: MULTI_TRACK,
      windowCrop: HALF_RESOLUTION_CROP,
    });
    expect(setup.lenses[0]?.window).toEqual({ x: 32, y: 16, width: 5312, height: 5280 });
    expect(setup.lenses[1]?.window).toEqual({ x: 5376 + 32, y: 16, width: 5312, height: 5280 });
  });

  it('ignores a window whose sensor size is missing', () => {
    const setup = buildStitchingSetup({
      calibration,
      layout: MULTI_TRACK,
      windowCrop: { ...X5_CROP, sensorWidth: undefined },
    });
    expect(setup.lenses[0]?.window).toEqual({ x: 0, y: 0, width: 5376, height: 5376 });
  });

  it('gives each file of a split-file pair its own frame', () => {
    const setup = buildStitchingSetup({ calibration, layout: SPLIT_FILES, windowCrop: undefined });
    expect(setup.frameCount).toBe(2);
    expect(setup.lenses.map((lens) => lens.frameIndex)).toEqual([0, 1]);
  });

  it('refuses a calibration that lacks a lens the layout needs', () => {
    const [first] = calibration.lenses;
    if (!first) throw new Error('no lens');
    const twice = { ...calibration, lenses: [first, first] };
    expect(
      captureError(() =>
        buildStitchingSetup({ calibration: twice, layout: MULTI_TRACK, windowCrop: undefined }),
      ),
    ).toMatchObject({ code: 'invalid-calibration' });
  });

  it('uses the whole canvas square when the info record has no crop', () => {
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK, windowCrop: undefined });
    expect(setup.lenses[1]?.window).toEqual({ x: 5376, y: 0, width: 5376, height: 5376 });
  });

  it('shares one frame between the halves of a packed layout', () => {
    const setup = buildStitchingSetup({ calibration, layout: PACKED, windowCrop: undefined });
    expect(setup.frameCount).toBe(1);
    expect(setup.lenses.map((lens) => [lens.frameIndex, lens.region])).toEqual([
      [0, LEFT_HALF],
      [0, RIGHT_HALF],
    ]);
  });

  it('refuses a layout whose lens count differs from the calibration', () => {
    const oneLens: LensLayout = { ...PACKED, sources: PACKED.sources.slice(0, 1) };
    expect(
      captureError(() =>
        buildStitchingSetup({ calibration, layout: oneLens, windowCrop: undefined }),
      ),
    ).toMatchObject({ code: 'unsupported-layout' });
  });

  it('exposes the polynomial and legacy calibrations as radial polynomials', () => {
    for (const text of [OFFICE_CALIBRATION.offsetV2, OFFICE_CALIBRATION.offset]) {
      const setup = buildStitchingSetup({
        calibration: parseOffsetString(text),
        layout: MULTI_TRACK,
        windowCrop: undefined,
      });
      expect(setup.lenses.every((lens) => lens.projection.kind === 'radial-polynomial')).toBe(true);
    }
  });
});
