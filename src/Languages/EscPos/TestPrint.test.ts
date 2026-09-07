import { expect, describe, it } from 'vitest';
import * as Cmds from '../../Commands/index.js';
import { PrinterConfig } from '../../Commands/PrinterConfig.js';
import { EscPos } from './EscPos.js';

const decode = (b: Uint8Array) => new TextDecoder('ascii').decode(b);

function transpile(cmd: Cmds.IPrinterCommand, config = new PrinterConfig()) {
  const cmdSet = new EscPos();
  const docState = Cmds.getNewTranspileState(config);
  const out = cmdSet.transpileCommand(cmd, docState);
  if (out instanceof Cmds.TranspileDocumentError) { throw out; }
  return out;
}

describe('ESC/POS test print', () => {
  // A TH230+ accepts GS ( A for every documented n/m pair and prints nothing.
  it('renders the rolling pattern as text rather than GS ( A', () => {
    const text = decode(transpile(new Cmds.TestPrint('rolling')));

    expect(text).not.toContain('\x1d(A');
    const lines = text.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(16);
  });

  it('keeps the rolling pattern within the configured line width', () => {
    const config = new PrinterConfig();
    const width = config.charactersPerLine;

    const lines = decode(transpile(new Cmds.TestPrint('rolling')))
      .split('\n')
      .filter(l => l.length > 0);

    // A longer line wraps and ruins the pattern, as a hardcoded 48 did on a
    // 42 column printer.
    expect(lines.every(l => l.length === width)).toBe(true);
  });

  it('shifts the pattern by one character per line', () => {
    const lines = decode(transpile(new Cmds.TestPrint('rolling')))
      .split('\n')
      .filter(l => l.length > 0);

    expect(lines[0]?.slice(1)).toBe(lines[1]?.slice(0, -1));
  });

  it('renders the status page from the known configuration', () => {
    const config = new PrinterConfig();
    config.update({
      messageType: 'SettingUpdateMessage',
      printerHardware: {
        manufacturer: 'WINCOR-NIXDORF',
        model: 'TH230+',
        serialNumber: '97AX905906',
        firmware: '01.12',
      },
    });

    const text = decode(transpile(new Cmds.TestPrint('printerStatus'), config));

    expect(text).not.toContain('\x1d(A');
    expect(text).toContain('WINCOR-NIXDORF');
    expect(text).toContain('TH230+');
    expect(text).toContain('97AX905906');
    expect(text).toContain('01.12');
  });

  it('leaves hexadecimal dump as GS ( A with a documented n value', () => {
    const bytes = transpile(new Cmds.TestPrint('hexadecimal'));

    // n=1 is not a listed value; the paper argument is 0 or 48.
    expect(Array.from(bytes)).toEqual([0x1d, 0x28, 0x41, 0x02, 0x00, 0x00, 0x01]);
  });
});
