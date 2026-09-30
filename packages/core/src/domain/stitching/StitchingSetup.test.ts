import { describe, expect, it } from 'vitest';

import { buildStitchingSetup, lensFrameOrder } from './StitchingSetup';
import { FULL_FRAME, LEFT_HALF, RIGHT_HALF, type LensLayout } from './LensLayout';
import { parseOffsetString } from '../format/calibration/parseOffsetString';
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

  it('maps each lens onto its frame and the whole canvas square holding its principal point', () => {
    const setup = buildStitchingSetup({ calibration, layout: MULTI_TRACK });
    expect(setup.frameSlotCount).toBe(2);
    expect(setup.feather.start).toBeLessThan(setup.feather.end);
    expect(setup.lenses.map((lens) => [lens.lensIndex, lens.frameSlot])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(setup.lenses[0]?.window).toEqual({ x: 0, y: 0, width: 5376, height: 5376 });
    expect(setup.lenses[1]?.window).toEqual({ x: 5376, y: 0, width: 5376, height: 5376 });
    expect(setup.lenses[0]?.projection.kind).toBe('mei');
    const backLens = setup.lenses[1];
    if (!backLens) throw new Error('no second lens');
    const forwardInLens = transformVector(backLens.rotation, [0, 0, -1]);
    expect(forwardInLens[2]).toBeCloseTo(1, 2);
  });

  it('draws each lens at the radial scale of its calibration', () => {
    const scaled = {
      ...calibration,
      lenses: calibration.lenses.map((lens) => ({ ...lens, radialScale: 1.5 })),
    };
    const setup = buildStitchingSetup({ calibration: scaled, layout: MULTI_TRACK });
    const [lens] = setup.lenses;
    const [model] = calibration.lenses.map((calibrated) => calibrated.model.projection);
    if (lens?.projection.kind !== 'mei' || model?.kind !== 'mei') throw new Error('not Mei');
    expect(lens.projection.focal).toEqual([model.focal[0] * 1.5, model.focal[1] * 1.5]);
    expect(lens.projection.principalPoint).toEqual(model.principalPoint);
  });

  it('gives each file of a split-file pair its own frame', () => {
    const setup = buildStitchingSetup({ calibration, layout: SPLIT_FILES });
    expect(setup.frameSlotCount).toBe(2);
    expect(setup.lenses.map((lens) => lens.frameSlot)).toEqual([0, 1]);
  });

  it('refuses a calibration that lacks a lens the layout needs', () => {
    const [first] = calibration.lenses;
    if (!first) throw new Error('no lens');
    const twice = { ...calibration, lenses: [first, first] };
    expect(
      captureError(() => buildStitchingSetup({ calibration: twice, layout: MULTI_TRACK })),
    ).toMatchObject({ code: 'invalid-calibration' });
  });

  it('shares one frame between the halves of a packed layout', () => {
    const setup = buildStitchingSetup({ calibration, layout: PACKED });
    expect(setup.frameSlotCount).toBe(1);
    expect(setup.lenses.map((lens) => [lens.frameSlot, lens.region])).toEqual([
      [0, LEFT_HALF],
      [0, RIGHT_HALF],
    ]);
  });

  it('refuses a layout whose lens count differs from the calibration', () => {
    const oneLens: LensLayout = { ...PACKED, sources: PACKED.sources.slice(0, 1) };
    expect(captureError(() => buildStitchingSetup({ calibration, layout: oneLens }))).toMatchObject(
      { code: 'unsupported-layout' },
    );
  });

  it('exposes the polynomial and legacy calibrations as radial polynomials', () => {
    for (const text of [OFFICE_CALIBRATION.offsetV2, OFFICE_CALIBRATION.offset]) {
      const setup = buildStitchingSetup({
        calibration: parseOffsetString(text),
        layout: MULTI_TRACK,
      });
      expect(setup.lenses.every((lens) => lens.projection.kind === 'radial-polynomial')).toBe(true);
    }
  });
});
