import { expect, describe, it } from 'vitest';
import { CodepageEncoder, type Codepage } from './CodepageEncoder.js';

/** Encode a string against a single codepage and return the bytes. */
function encodeWith(input: string, codepage: Codepage) {
  const fragments = CodepageEncoder.autoEncode(input, [codepage]);
  return {
    codepages: fragments.map(f => f.codepage),
    bytes: [...fragments.flatMap(f => [...f.bytes])],
  };
}

describe('CP850 table', () => {
  // CP850 previously held a byte-for-byte copy of the CP852 table. Because
  // CP850 sits in the default candidate list, autoEncode would pick it, the
  // library would emit ESC t 2 to switch the printer to *real* CP850, and then
  // send a CP852 byte - so the printer rendered the wrong glyph.
  it('is not a copy of CP852', () => {
    // 'ů' exists in CP852 but not in CP850.
    const inCp852 = encodeWith('ů', 'CP852');
    expect(inCp852.bytes).toStrictEqual([0x85]);

    const inCp850 = CodepageEncoder.autoEncode('ů', ['CP850']);
    // Unmappable in real CP850, so it must fall back to '?'.
    expect([...inCp850.flatMap(f => [...f.bytes])]).toStrictEqual([0x3f]);
  });

  it('encodes the Western European characters CP850 is chosen for', () => {
    // These are the characters CP850 exists to provide and CP852 lacks
    // entirely. Under the duplicated table every one of them was unmappable.
    const cases: [string, number][] = [
      ['ø', 0x9b],
      ['£', 0x9c],
      ['Ø', 0x9d],
      ['ð', 0xd0],
      ['Ð', 0xd1],
      ['þ', 0xe7],
      ['Þ', 0xe8],
      ['ý', 0xec],
      ['Ý', 0xed],
      ['¥', 0xbe],
      ['ÿ', 0x98],
    ];
    for (const [char, expected] of cases) {
      expect(encodeWith(char, 'CP850').bytes, `encoding ${char}`).toStrictEqual([expected]);
    }
  });

  it('keeps the codepoints CP850 shares with CP858', () => {
    // CP850 and CP858 differ at exactly one byte: 0xD5 is 'ı' in CP850 and the
    // euro sign in CP858.
    expect(encodeWith('ı', 'CP850').bytes).toStrictEqual([0xd5]);
    expect(encodeWith('€', 'CP858').bytes).toStrictEqual([0xd5]);
    // The euro is not in real CP850.
    expect(encodeWith('€', 'CP850').bytes).toStrictEqual([0x3f]);
  });
});

describe('autoEncode', () => {
  it('passes ASCII through unchanged', () => {
    expect(encodeWith('Hello', 'CP437').bytes)
      .toStrictEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('emits one replacement byte per astral character, not two', () => {
    // Iterating by UTF-16 unit split emoji into two lone surrogates, neither
    // of which is in any codepage, so a single character became two '?' bytes
    // and every subsequent column on the receipt shifted.
    expect(encodeWith('🐁', 'CP437').bytes).toStrictEqual([0x3f]);
    expect(encodeWith('a🐁b', 'CP437').bytes).toStrictEqual([0x61, 0x3f, 0x62]);
  });

  it('switches codepages only when it has to', () => {
    const fragments = CodepageEncoder.autoEncode('abcÇ', ['CP437']);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.codepage).toBe('CP437');
  });

  it('rejects an empty candidate list rather than producing undefined output', () => {
    expect(() => CodepageEncoder.autoEncode('a', [])).toThrow();
  });
});
