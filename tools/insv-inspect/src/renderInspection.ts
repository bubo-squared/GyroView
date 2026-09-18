import type { Inspection, LensSummary } from './Inspection';

const MICROSECONDS_PER_SECOND = 1_000_000;
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
    `Timing: first frame ${show(info.firstFrameTimestamp)} us, gyro offset ${show(info.gyroTimestampMs)} ms, ` +
      `rolling shutter ${showFixed(info.rollingShutterTimeMs)} ms, pts type ${show(info.ptsType)}`,
    `Gyro config: type ${show(info.gyroType)}, raw ${show(info.isRawGyro)}, ` +
      `ranges ${show(info.sensorRanges?.accelerometerG)} g / ${show(info.sensorRanges?.gyroscopeDps)} dps`,
    `Layout hints: file layout ${show(info.fileLayout)}, track order ${show(info.trackOrder)}`,
  ];
}

function renderCalibration(inspection: Inspection): string[] {
  const { calibration } = inspection;
  return [
    `Calibration: v${calibration.version} on a ${calibration.canvas[0]}x${calibration.canvas[1]} canvas`,
    ...calibration.lenses.map((lens) => renderLens(lens)),
    ...calibration.warnings.map((warning) => `  warning: ${warning}`),
  ];
}

function renderLens(lens: LensSummary): string {
  const centre = lens.principalPoint.map((value) => fixed(value)).join(', ');
  const orientation = lens.orientationDegrees.map((value) => fixed(value)).join(', ');
  const translation = lens.translationMetres
    .map((value) => value.toFixed(TRANSLATION_DECIMALS))
    .join(', ');
  return `  lens ${lens.index}: ${lens.model}, centre (${centre}), ypr (${orientation}) deg, translation (${translation}) m`;
}

function renderGyro(inspection: Inspection): string {
  const { gyro } = inspection;
  if (gyro === undefined) return 'Gyro: none';
  const spanSeconds = (gyro.lastTimestampUs - gyro.firstTimestampUs) / MICROSECONDS_PER_SECOND;
  return (
    `Gyro: ${gyro.samples.toLocaleString('en-US')} samples over ${fixed(spanSeconds)} s, ` +
    `mean interval ${showFixed(gyro.meanIntervalUs)} us, mean |a| ${fixed(gyro.meanAccelerationMagnitudeG)} g`
  );
}

function renderExposure(inspection: Inspection): string {
  const { exposure } = inspection;
  return exposure === undefined
    ? 'Exposure: none'
    : `Exposure: ${exposure.entries.toLocaleString('en-US')} entries from ${exposure.firstTimestampUs} to ${exposure.lastTimestampUs} us, ` +
        `mean shutter 1/${Math.round(1 / exposure.meanExposureSeconds)} s, ` +
        `first encoded frame at entry ${show(exposure.firstEncodedFrameEntry)}`;
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
