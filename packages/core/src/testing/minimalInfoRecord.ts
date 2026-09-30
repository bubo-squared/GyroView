import { InfoField } from '../domain/format/info/infoFields';
import { encodeProtobuf, stringField, varintField, type ProtobufField } from './protobufWriter';

export interface MinimalInfo {
  readonly model: string;
  readonly firstFrameTimestamp?: number;
  readonly ptsType?: number;
  readonly fileLayout?: number;
  readonly trackOrder?: number;
}

/**
 * A hand-encoded info record with just the fields named: enough to read a recording of a camera
 * without calibration or timing, which no committed fixture represents.
 */
export function minimalInfoRecord(info: MinimalInfo): Uint8Array {
  return encodeProtobuf(minimalInfoFields(info));
}

/**
 * The fields of {@link minimalInfoRecord}, for a record that needs more of them, such as a
 * calibration string.
 */
export function minimalInfoFields(info: MinimalInfo): ProtobufField[] {
  return [
    stringField(InfoField.Model, info.model),
    ...optionalVarint(InfoField.FirstFrameTimestamp, info.firstFrameTimestamp),
    ...optionalVarint(InfoField.PtsType, info.ptsType),
    ...optionalVarint(InfoField.FileLayout, info.fileLayout),
    ...optionalVarint(InfoField.TrackOrder, info.trackOrder),
  ];
}

function optionalVarint(number: number, value: number | undefined): ProtobufField[] {
  return value === undefined ? [] : [varintField(number, value)];
}
