import { expect, describe, it } from 'vitest';
import * as Msgs from './Messages.js';
import { AsciiCodeNumbers } from '../Util/ASCII.js';

describe('RawMessageTransformer', () => {
  it('combineMessages', () => {
    const t = new Msgs.RawMessageTransformer();
    expect(t.combineMessages(new Uint8Array([AsciiCodeNumbers.CR]), new Uint8Array([AsciiCodeNumbers.LF])))
      .toStrictEqual(new Uint8Array([AsciiCodeNumbers.CR, AsciiCodeNumbers.LF]));
    expect(t.combineMessages(new Uint8Array([]), new Uint8Array([AsciiCodeNumbers.LF])))
      .toStrictEqual(new Uint8Array([AsciiCodeNumbers.LF]));
  });
});

describe('StringMessageTransformer', () => {
  it('combineMessages', () => {
    const t = new Msgs.StringMessageTransformer();
    expect(t.combineMessages('\r', '\n'))
      .toStrictEqual('\r\n');
    expect(t.combineMessages('', '\n'))
      .toStrictEqual('\n');
  })
});

describe('Converters', () => {
  it('Uint8Array to String', () => {
    const expected = "This is my expected message!";
    const arr = Msgs.asUint8Array(expected);
    const result = Msgs.asString(arr);
    expect(result).toStrictEqual(expected);
  });
  it('String to Uint8Array', () => {
    const expected = new Uint8Array([AsciiCodeNumbers.CR, AsciiCodeNumbers.LF]);
    const arr = Msgs.asString(expected);
    const result = Msgs.asUint8Array(arr);
    expect(result).toStrictEqual(expected);
  })
})

describe('Codepage byte round-tripping', () => {
  it('preserves bytes above 0x7F', () => {
    // asString used TextDecoder('ascii'), which the Encoding Standard defines
    // as an alias for windows-1252, while asUint8Array used TextEncoder, which
    // emits UTF-8. The pair was not lossless: every codepage byte in 0x80-0xFF
    // came back as a different value, or as two or three bytes.
    const bytes = new Uint8Array([0x80, 0x92, 0x9f, 0xa0, 0xc7, 0xfe, 0xff]);
    expect(Msgs.asUint8Array(Msgs.asString(bytes))).toStrictEqual(bytes);
  });

  it('round-trips every possible byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) { all[i] = i; }
    expect(Msgs.asUint8Array(Msgs.asString(all))).toStrictEqual(all);
  });

  it('does not expand high bytes into UTF-8 sequences', () => {
    // 0xC7 is 'Ç' in CP850. Encoded as UTF-8 it would be two bytes, and the
    // printer would render mojibake.
    const single = new Uint8Array([0xc7]);
    expect(Msgs.asUint8Array(Msgs.asString(single))).toHaveLength(1);
  });
});
