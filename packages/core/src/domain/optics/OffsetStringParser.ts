import { EquidistantModel } from './EquidistantModel';
import {
  CalibrationVersion,
  type CalibrationSet,
  type CanvasSize,
  type EulerDegrees,
  type LensCalibration,
} from './LensCalibration';
import { MeiModel } from './MeiModel';
import {
  FIRST_LENS_TOKEN,
  LENS_COUNT_TOKEN,
  V1_LENS_TOKENS,
  V1_LENS_TYPE_MASK,
  V1_TRAILING_TOKENS,
  V1_VERSION_SHIFT,
  V1Token,
  V1Trailing,
  V2_LENS_TOKENS,
  V2Token,
  V3_LENS_TOKENS,
  V3Token,
  V6_LENS_TOKENS,
  VERSION_WORD_SHIFT,
  VERSIONED_TRAILING_TOKENS,
} from './offsetTokens';
import { DEFAULT_HALF_FIELD_OF_VIEW } from './opticsConstants';
import { PolynomialModel } from './PolynomialModel';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { degrees } from '../../shared/units/angle';

const TOKEN_SEPARATOR = '_';

interface Layout {
  readonly version: CalibrationVersion;
  readonly lensTokens: number;
  readonly trailingTokens: number;
}

/**
 * A layout matched against a concrete string, with the version word it ends with.
 */
interface ResolvedLayout extends Layout {
  readonly versionWord: number;
}

const LAYOUTS: readonly Layout[] = [
  {
    version: CalibrationVersion.Legacy,
    lensTokens: V1_LENS_TOKENS,
    trailingTokens: V1_TRAILING_TOKENS,
  },
  {
    version: CalibrationVersion.Polynomial,
    lensTokens: V2_LENS_TOKENS,
    trailingTokens: VERSIONED_TRAILING_TOKENS,
  },
  {
    version: CalibrationVersion.Mei,
    lensTokens: V3_LENS_TOKENS,
    trailingTokens: VERSIONED_TRAILING_TOKENS,
  },
];

/**
 * Reads one lens block by named token.
 */
type LensBlock = (token: number) => number;

/**
 * Parses `offset`, `offset_v2` and `offset_v3` strings into a {@link CalibrationSet}. The v6
 * layout (13 distortion coefficients per lens) is recognised and rejected explicitly.
 */
export class OffsetStringParser {
  public parse(text: string): CalibrationSet {
    const numbers = text.split(TOKEN_SEPARATOR).map((token) => this.parseNumber(token, text));
    const lensCount = numbers[LENS_COUNT_TOKEN] ?? 0;
    const layout = this.detectLayout(numbers, lensCount, text);
    const blocks = Array.from({ length: lensCount }, (_unused, index) =>
      this.lensBlock(numbers, layout, index),
    );
    return {
      version: layout.version,
      canvas: this.canvasOf(numbers, layout, blocks),
      lenses: blocks.map((block, index) => this.parseLens(block, layout, index)),
    };
  }

  private detectLayout(
    numbers: readonly number[],
    lensCount: number,
    text: string,
  ): ResolvedLayout {
    const tokenCount = numbers.length;
    const layout = LAYOUTS.find(
      (candidate) =>
        tokenCount ===
        FIRST_LENS_TOKEN + lensCount * candidate.lensTokens + candidate.trailingTokens,
    );
    if (layout) {
      const versionWord = numbers.at(-1) ?? 0;
      this.ensureVersionWordMatches(layout, versionWord);
      return { ...layout, versionWord };
    }
    if (tokenCount === FIRST_LENS_TOKEN + lensCount * V6_LENS_TOKENS + VERSIONED_TRAILING_TOKENS) {
      throw new GyroViewError(
        'unsupported-calibration',
        'calibration string uses the v6 layout (13 distortion coefficients), which is not supported yet',
      );
    }
    throw new GyroViewError(
      'invalid-calibration',
      `calibration string has ${tokenCount} tokens for ${lensCount} lenses, matching no known layout: ${text}`,
    );
  }

  private ensureVersionWordMatches(layout: Layout, versionWord: number): void {
    const shift =
      layout.version === CalibrationVersion.Legacy ? V1_VERSION_SHIFT : VERSION_WORD_SHIFT;
    const encoded = versionWord >>> shift;
    if (encoded !== layout.version) {
      throw new GyroViewError(
        'invalid-calibration',
        `calibration string has the v${layout.version} layout but declares version ${encoded}`,
      );
    }
  }

  private lensBlock(numbers: readonly number[], layout: Layout, index: number): LensBlock {
    const start = FIRST_LENS_TOKEN + index * layout.lensTokens;
    return (token) => numbers[start + token] ?? NaN;
  }

  private parseLens(block: LensBlock, layout: ResolvedLayout, index: number): LensCalibration {
    switch (layout.version) {
      case CalibrationVersion.Legacy: {
        return this.parseV1Lens(block, index, layout.versionWord);
      }
      case CalibrationVersion.Polynomial: {
        return this.parseV2Lens(block, index);
      }
      case CalibrationVersion.Mei: {
        return this.parseV3Lens(block, index);
      }
    }
  }

  private parseV1Lens(block: LensBlock, index: number, versionWord: number): LensCalibration {
    return {
      index,
      model: new EquidistantModel(
        {
          edgeRadius: block(V1Token.EdgeRadius),
          principalPoint: { x: block(V1Token.CenterX), y: block(V1Token.CenterY) },
        },
        DEFAULT_HALF_FIELD_OF_VIEW,
      ),
      orientation: this.euler(block(V1Token.Yaw), block(V1Token.Pitch), block(V1Token.Roll)),
      translation: [0, 0, 0],
      lensType: versionWord & V1_LENS_TYPE_MASK,
    };
  }

  private parseV2Lens(block: LensBlock, index: number): LensCalibration {
    return {
      index,
      model: new PolynomialModel(
        {
          edgeRadius: block(V2Token.EdgeRadius),
          principalPoint: { x: block(V2Token.CenterX), y: block(V2Token.CenterY) },
          coefficients: [
            block(V2Token.C1),
            block(V2Token.C2),
            block(V2Token.C3),
            block(V2Token.C4),
          ],
        },
        DEFAULT_HALF_FIELD_OF_VIEW,
      ),
      orientation: this.euler(block(V2Token.Yaw), block(V2Token.Pitch), block(V2Token.Roll)),
      translation: [
        block(V2Token.TranslationX),
        block(V2Token.TranslationY),
        block(V2Token.TranslationZ),
      ],
      lensType: block(V2Token.LensType),
    };
  }

  private parseV3Lens(block: LensBlock, index: number): LensCalibration {
    return {
      index,
      model: new MeiModel(
        {
          xi: block(V3Token.Xi),
          focal: [block(V3Token.FocalX), block(V3Token.FocalY)],
          principalPoint: { x: block(V3Token.CenterX), y: block(V3Token.CenterY) },
          radial: [block(V3Token.K1), block(V3Token.K2), block(V3Token.K3)],
          tangential: [block(V3Token.P1), block(V3Token.P2)],
        },
        DEFAULT_HALF_FIELD_OF_VIEW,
      ),
      orientation: this.euler(block(V3Token.Yaw), block(V3Token.Pitch), block(V3Token.Roll)),
      translation: [
        block(V3Token.TranslationX),
        block(V3Token.TranslationY),
        block(V3Token.TranslationZ),
      ],
      lensType: block(V3Token.LensType),
    };
  }

  private canvasOf(
    numbers: readonly number[],
    layout: Layout,
    blocks: readonly LensBlock[],
  ): CanvasSize {
    const firstBlock = blocks[0];
    if (firstBlock === undefined || layout.version === CalibrationVersion.Legacy) {
      const trailingStart = FIRST_LENS_TOKEN + (numbers[LENS_COUNT_TOKEN] ?? 0) * layout.lensTokens;
      return {
        width: numbers[trailingStart + V1Trailing.CanvasWidth] ?? 0,
        height: numbers[trailingStart + V1Trailing.CanvasHeight] ?? 0,
      };
    }
    const tokens = layout.version === CalibrationVersion.Polynomial ? V2Token : V3Token;
    return { width: firstBlock(tokens.CanvasWidth), height: firstBlock(tokens.CanvasHeight) };
  }

  private euler(yaw: number, pitch: number, roll: number): EulerDegrees {
    return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
  }

  private parseNumber(token: string, text: string): number {
    const value = Number(token);
    if (token.trim() === '' || Number.isNaN(value)) {
      throw new GyroViewError(
        'invalid-calibration',
        `calibration token "${token}" is not a number in: ${text}`,
      );
    }
    return value;
  }
}
