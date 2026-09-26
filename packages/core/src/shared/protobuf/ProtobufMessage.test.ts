import { describe, expect, it } from 'vitest';

import { ProtobufMessage } from './ProtobufMessage';
import { captureError } from '../../../test/support/errors';

// Hand-encoded: field 1 varint 150, field 2 string "hi", field 3 double 1.5,
// field 4 nested { field 1 varint 7 }, field 5 varint 0, field 1 varint 1 (repeated).
const SAMPLE = new Uint8Array([
  0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f,
  0x22, 0x02, 0x08, 0x07, 0x28, 0x00, 0x08, 0x01,
]);

describe('ProtobufMessage', () => {
  const message = ProtobufMessage.decode(SAMPLE);

  it('decodes multi-byte varints', () => {
    expect(ProtobufMessage.decode(SAMPLE.subarray(0, 3)).varint(1)).toBe(150);
  });

  it('decodes strings and doubles', () => {
    expect(message.string(2)).toBe('hi');
    expect(message.double(3)).toBe(1.5);
  });

  it('decodes nested messages lazily', () => {
    expect(message.message(4)?.varint(1)).toBe(7);
  });

  it('lets the last occurrence of a repeated field win', () => {
    expect(message.varint(1)).toBe(1);
  });

  it('reports absence as undefined and zero as false', () => {
    expect(message.varint(99)).toBeUndefined();
    expect(message.boolean(5)).toBe(false);
    expect(message.boolean(99)).toBeUndefined();
  });

  it('rejects reading a field with the wrong wire type', () => {
    expect(captureError(() => message.string(1))).toMatchObject({ code: 'invalid-protobuf' });
    expect(captureError(() => message.double(2))).toMatchObject({ code: 'invalid-protobuf' });
  });

  it('rejects truncated messages', () => {
    expect(captureError(() => ProtobufMessage.decode(SAMPLE.subarray(0, 5)))).toMatchObject({
      code: 'invalid-protobuf',
      message: expect.stringContaining('truncated') as string,
    });
  });

  it('rejects the obsolete group wire types', () => {
    expect(captureError(() => ProtobufMessage.decode(new Uint8Array([0x0b])))).toMatchObject({
      code: 'invalid-protobuf',
      message: expect.stringContaining('wire type 3') as string,
    });
  });

  it('carries an oversized varint in an unread field without failing the message', () => {
    const huge = new Uint8Array([
      0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f, 0x10, 0x05,
    ]);
    const decoded = ProtobufMessage.decode(huge);
    expect(decoded.varint(2)).toBe(5);
    expect(captureError(() => decoded.varint(1))).toMatchObject({ code: 'binary-unsafe-integer' });
  });

  it('rejects a varint longer than ten bytes', () => {
    const runaway = new Uint8Array([0x08, ...Array.from({ length: 11 }, () => 0xff)]);
    expect(captureError(() => ProtobufMessage.decode(runaway))).toMatchObject({
      code: 'invalid-protobuf',
    });
  });

  it('rejects a length prefix larger than the message', () => {
    expect(
      captureError(() => ProtobufMessage.decode(new Uint8Array([0x12, 0xff, 0x7f]))),
    ).toMatchObject({
      code: 'invalid-protobuf',
    });
  });

  it('decodes an empty message', () => {
    expect(ProtobufMessage.decode(new Uint8Array()).varint(1)).toBeUndefined();
  });
});
