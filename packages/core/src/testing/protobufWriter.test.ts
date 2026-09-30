import { describe, expect, it } from 'vitest';

import { ProtobufMessage } from '../shared/protobuf/ProtobufMessage';
import {
  doubleField,
  encodeProtobuf,
  messageField,
  stringField,
  varintField,
} from './protobufWriter';
import { captureError } from '../../test/support/errors';

describe('encodeProtobuf', () => {
  it('encodes the hand-written sample the decoder is tested on, byte for byte', () => {
    const encoded = encodeProtobuf([
      varintField(1, 150),
      stringField(2, 'hi'),
      doubleField(3, 1.5),
      messageField(4, [varintField(1, 7)]),
      varintField(5, 0),
      varintField(1, 1),
    ]);
    expect([...encoded]).toEqual([
      0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8,
      0x3f, 0x22, 0x02, 0x08, 0x07, 0x28, 0x00, 0x08, 0x01,
    ]);
  });

  it('writes what the decoder reads back, for field numbers past one key byte', () => {
    const nested = messageField(27, [varintField(3, 300)]);
    const message = ProtobufMessage.decode(
      encodeProtobuf([
        stringField(111, '2_1.5_2'),
        varintField(136, 2 ** 40),
        doubleField(25, -0.25),
        nested,
      ]),
    );
    expect(message.string(111)).toBe('2_1.5_2');
    expect(message.varint(136)).toBe(2 ** 40);
    expect(message.double(25)).toBe(-0.25);
    expect(message.message(27)?.varint(3)).toBe(300);
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
