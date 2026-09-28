import {
  secondsToMilliseconds,
  type ExposureSummary,
  type LensSummary,
  type Seconds,
} from '@gyroview/core';

import type { Inspection } from './Inspection';

const DECIMALS = 3;
const TRANSLATION_DECIMALS = 6;
const HEX_RADIX = 16;
const HEX_ID_DIGITS = 2;
const ID_WIDTH = 6;
const NUMBER_WIDTH = 14;
const UNKNOWN = '?';

/**
 * Human-readable multi-line report of an {@link Inspection}.
 */
export function renderInspection(inspection: Inspection): string {
  return [
    ...renderFile(inspection),
    '',
    ...renderTrailer(inspection),
    '',
    ...renderInfo(inspection),
    '',
    ...renderCalibration(inspection),
    '',
    renderGyro(inspection),
    '',
    renderExposure(inspection),
  ].join('\n');
}

function renderFile(inspection: Inspection): string[] {
  return [
    `File: ${inspection.file} (${inspection.fileSize.toLocaleString('en-US')} bytes)`,
    'Boxes:',
    ...inspection.boxes.map(
      (box) => `  ${box.type}  offset ${pad(box.offset)}  size ${pad(box.size)}`,
    ),
  ];
}

function renderTrailer(inspection: Inspection): string[] {
  return [
    `Trailer: version ${inspection.trailerVersion}, ${inspection.trailerWrapper}, payload at ${inspection.payloadStart}`,
    'Records (id format offset size):',
    ...inspection.records.map(
      (record) =>
        `  ${hexId(record.id).padEnd(ID_WIDTH)} ${record.format}  ${pad(record.offset)}  ${pad(record.size)}`,
    ),
  ];
}

function renderInfo(inspection: Inspection): string[] {
  const { info } = inspection;
  const dimension = info.dimension ? `${info.dimension.width}x${info.dimension.height}` : UNKNOWN;
  return [
    `Camera: ${show(info.model)}, firmware ${show(info.firmware)}, serial ${show(info.serialNumber)}`,
    `Video: ${dimension} per lens track, ${show(info.frameRate)} fps, mode ${show(info.captureMode)}`,
    `Timing: first frame ${show(info.firstFrameTimestamp)}, gyro offset ${show(info.gyroOffset)} ms, ` +
      `readout ${showFixed(millisecondsOf(info.readoutTime))} ms, ` +
      `frame times from ${show(info.preferredFrameTimeSource)}`,
    `Gyro config: type ${show(info.gyroType)}, raw ${show(info.isRawGyro)}, ` +
      `ranges ${show(info.sensorRanges?.accelerometerG)} g / ${show(info.sensorRanges?.gyroscopeDps)} dps`,
    `Layout hints: file layout ${show(info.fileLayout)}, track order ${show(info.trackOrder)}`,
  ];
}

function renderCalibration(inspection: Inspection): string[] {
  const { calibration } = inspection;
  const warnings = inspection.calibrationWarnings.map((warning) => `  warning: ${warning}`);
  return calibration === undefined
    ? ['Calibration: none usable', ...warnings]
    : [
        `Calibration: v${calibration.version} on a ${calibration.canvas[0]}x${calibration.canvas[1]} canvas`,
        ...calibration.lenses.map((lens) => renderLens(lens)),
        ...warnings,
      ];
}

function renderLens(lens: LensSummary): string {
  const centre = lens.principalPoint.map((value) => fixed(value)).join(', ');
  const orientation = lens.orientationDegrees.map((value) => fixed(value)).join(', ');
  const translation = lens.translationMetres
    .map((value) => value.toFixed(TRANSLATION_DECIMALS))
    .join(', ');
  return `  lens ${lens.lensIndex}: ${lens.model}, centre (${centre}), ypr (${orientation}) deg, translation (${translation}) m`;
}

function renderGyro(inspection: Inspection): string {
  const { gyro } = inspection;
  if (gyro === undefined) return 'Gyro: none';
  if ('unreadable' in gyro) return `Gyro: unreadable (${gyro.unreadable})`;
  const stray = gyro.strayBytes > 0 ? `, ${gyro.strayBytes} stray byte(s)` : '';
  const damaged =
    gyro.damagedSamples > 0 ? `, ${gyro.damagedSamples} damaged sample(s) left out` : '';
  const mended = gyro.mendedStamps > 0 ? `, ${gyro.mendedStamps} stamp(s) mended` : '';
  return (
    `Gyro: ${gyro.layout} layout, ${gyro.samples.toLocaleString('en-US')} samples over ${fixed(gyro.spanSeconds)} s, ` +
    `mean interval ${showFixed(gyro.meanIntervalUs)} us, mean |a| ${showFixed(gyro.meanAccelerationMagnitudeG)} g${stray}${damaged}${mended}`
  );
}

function renderExposure(inspection: Inspection): string {
  const { exposure } = inspection;
  if (exposure === undefined) return 'Exposure: none';
  if ('damaged' in exposure) return 'Exposure: damaged, left out';
  return 'unread' in exposure
    ? `Exposure: not read (${exposure.unread})`
    : renderExposureSummary(exposure);
}

function renderExposureSummary(exposure: ExposureSummary): string {
  return (
    `Exposure: ${exposure.entries.toLocaleString('en-US')} entries from ${show(exposure.firstCaptureTimeUs)} to ${show(exposure.lastCaptureTimeUs)} us, ` +
    `mean shutter ${shutterOf(exposure.meanShutterTimeSeconds)}, ` +
    `first encoded frame at entry ${show(exposure.firstEncodedFrameEntry)}`
  );
}

/**
 * A shutter time as photographers write it, `1/640 s`; unknown for a record without entries.
 */
function shutterOf(seconds: number | undefined): string {
  return seconds === undefined || seconds <= 0 ? UNKNOWN : `1/${Math.round(1 / seconds)} s`;
}

function show(value: string | number | boolean | undefined): string {
  return value === undefined ? UNKNOWN : String(value);
}

function showFixed(value: number | undefined): string {
  return value === undefined ? UNKNOWN : fixed(value);
}

function fixed(value: number): string {
  return value.toFixed(DECIMALS);
}

function hexId(id: number): string {
  return `0x${id.toString(HEX_RADIX).padStart(HEX_ID_DIGITS, '0')}`;
}

function pad(value: number): string {
  return String(value).padStart(NUMBER_WIDTH);
}

function millisecondsOf(duration: Seconds | undefined): number | undefined {
  return duration === undefined ? undefined : secondsToMilliseconds(duration);
}
