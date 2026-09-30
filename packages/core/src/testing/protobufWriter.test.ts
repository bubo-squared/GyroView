import { describe, expect, it } from 'vitest';

import { ProtobufMessage } from '../shared/protobuf/ProtobufMessage';
import { encodeProtobuf, stringField, varintField } from './protobufWriter';
import { captureError } from '../../test/support/errors';

describe('encodeProtobuf', () => {
  it('encodes the hand-written sample the decoder is tested on, byte for byte', () => {
    const encoded = encodeProtobuf([
      varintField(1, 150),
      stringField(2, 'hi'),
      varintField(5, 0),
      varintField(1, 1),
    ]);
    expect([...encoded]).toEqual([
      0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69, 0x28, 0x00, 0x08, 0x01,
    ]);
  });

  it('writes what the decoder reads back, for field numbers past one key byte', () => {
    const message = ProtobufMessage.decode(
      encodeProtobuf([stringField(111, '2_1.5_2'), varintField(136, 2 ** 40)]),
    );
    expect(message.string(111)).toBe('2_1.5_2');
    expect(message.varint(136)).toBe(2 ** 40);
  });

  it('refuses a varint the wire format would not carry as given', () => {
    expect(captureError(() => encodeProtobuf([varintField(1, -1)]))).toMatchObject({
      code: 'invariant-violation',
    });
    expect(captureError(() => encodeProtobuf([varintField(1, 0.5)]))).toMatchObject({
      code: 'invariant-violation',
    });
  });
});
