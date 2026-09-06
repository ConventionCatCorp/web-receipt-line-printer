/** String-based ASCII control codes. */
export const enum AsciiCodeStrings {
  NUL = '\x00',
  SOH = '\x01',
  STX = '\x02',
  ETX = '\x03',
  EOT = '\x04',
  ENQ = '\x05',
  ACK = '\x06',
  BEL = '\x07',
  BS  = '\x08',
  TAB = '\x09',
  LF  = '\x0a',
  VT  = '\x0b',
  FF  = '\x0c',
  CR  = '\x0d',
  SO  = '\x0e',
  SI  = '\x0f',
  DLE = '\x10',
  DC1 = '\x11',
  DC2 = '\x12',
  DC3 = '\x13',
  DC4 = '\x14',
  NAK = '\x15',
  SYN = '\x16',
  ETB = '\x17',
  CAN = '\x18',
  EM  = '\x19',
  SUB = '\x1a',
  ESC = '\x1b',
  FS  = '\x1c',
  GS  = '\x1d',
  RS  = '\x1e',
  US  = '\x1f',
  DEL = '\x7F',
}

/** Number-based ASCII control codes. */
export const enum AsciiCodeNumbers {
  NUL = 0x00,
  SOH = 0x01,
  STX = 0x02,
  ETX = 0x03,
  EOT = 0x04,
  ENQ = 0x05,
  ACK = 0x06,
  BEL = 0x07,
  BS  = 0x08,
  TAB = 0x09,
  LF  = 0x0a,
  VT  = 0x0b,
  FF  = 0x0c,
  CR  = 0x0d,
  SO  = 0x0e,
  SI  = 0x0f,
  DLE = 0x10,
  DC1 = 0x11,
  DC2 = 0x12,
  DC3 = 0x13,
  DC4 = 0x14,
  NAK = 0x15,
  SYN = 0x16,
  ETB = 0x17,
  CAN = 0x18,
  EM  = 0x19,
  SUB = 0x1a,
  ESC = 0x1b,
  FS  = 0x1c,
  GS  = 0x1d,
  RS  = 0x1e,
  US  = 0x1f,
  DEL = 0x7F,
}

export const AsciiToDisplayLookup: Record<number, string> = {
  [AsciiCodeNumbers.NUL]: "NUL",
  [AsciiCodeNumbers.SOH]: "SOH",
  [AsciiCodeNumbers.STX]: "STX",
  [AsciiCodeNumbers.ETX]: "ETX",
  [AsciiCodeNumbers.EOT]: "EOT",
  [AsciiCodeNumbers.ENQ]: "ENQ",
  [AsciiCodeNumbers.ACK]: "ACK",
  [AsciiCodeNumbers.BEL]: "BEL",
  [AsciiCodeNumbers.BS]:  "BS",
  [AsciiCodeNumbers.TAB]: "TAB",
  [AsciiCodeNumbers.LF]:  "LF",
  [AsciiCodeNumbers.VT]:  "VT",
  [AsciiCodeNumbers.FF]:  "FF",
  [AsciiCodeNumbers.CR]:  "CR",
  [AsciiCodeNumbers.SO]:  "SO",
  [AsciiCodeNumbers.SI]:  "SI",
  [AsciiCodeNumbers.DLE]: "DLE",
  [AsciiCodeNumbers.DC1]: "DC1",
  [AsciiCodeNumbers.DC2]: "DC2",
  [AsciiCodeNumbers.DC3]: "DC3",
  [AsciiCodeNumbers.DC4]: "DC4",
  [AsciiCodeNumbers.NAK]: "NAK",
  [AsciiCodeNumbers.SYN]: "SYN",
  [AsciiCodeNumbers.ETB]: "ETB",
  [AsciiCodeNumbers.CAN]: "CAN",
  [AsciiCodeNumbers.EM]:  "EM",
  [AsciiCodeNumbers.SUB]: "SUB",
  [AsciiCodeNumbers.ESC]: "ESC",
  [AsciiCodeNumbers.FS]:  "FS",
  [AsciiCodeNumbers.GS]:  "GS",
  [AsciiCodeNumbers.RS]:  "RS",
  [AsciiCodeNumbers.US]:  "US",
  [AsciiCodeNumbers.DEL]: "DEL"
}

export function hex(num: number) {
  return "0x" + (num + 0x100).toString(16).slice(-2);
}

export function asciiToDisplay(...codes: number[]) {
  return codes.map(c => {
    const controlcode = c < 0x20
      ? AsciiToDisplayLookup[c] ?? hex(c)
      : String.fromCharCode(c);
    return `${hex(c)}[${controlcode}]`;
  }).join(', ');
}

/**
 * Convert an ASCII string to a raw byte array.
 *
 * Will throw an error for any characters not in the 256 character ASCII table.
 * Don't send this unicode and expect a happy ending.
 */
export function EncodeAscii(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let charIdx = 0; charIdx < str.length; charIdx++) {
    const char = str.charCodeAt(charIdx);
    if (char > 0xFF) {
      throw new Error(`Character at index ${charIdx} of "${str}" is not ASCII`);
    }
    out[charIdx] = char;
  }
  return out;
}

/**
 * Convert a byte array of raw ASCII codepoints to a string.
 *
 * This is the exact inverse of {@link EncodeAscii}: byte `n` becomes codepoint
 * `n`, for all of 0x00-0xFF.
 *
 * Note that `TextDecoder` cannot be used here. Per the WHATWG Encoding
 * Standard every label that sounds like it would work - 'ascii', 'us-ascii',
 * 'latin1', 'iso-8859-1' - is an alias for **windows-1252**, which remaps
 * 0x80-0x9F to characters like U+2020. Round-tripping those through
 * `EncodeAscii` (or `TextEncoder`, which emits UTF-8) corrupts every codepage
 * byte above 0x7F. Doing the mapping by hand is the only way to stay lossless.
 * @param array
 */
export function DecodeAscii(array: Uint8Array): string {
  // Chunked to avoid blowing the argument limit on large buffers.
  const chunkSize = 8192;
  let out = '';
  for (let i = 0; i < array.length; i += chunkSize) {
    out += String.fromCharCode(...array.subarray(i, i + chunkSize));
  }
  return out;
}
