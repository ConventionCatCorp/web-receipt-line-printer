import { expect, describe, it, vi } from 'vitest';
import * as Msgs from './Messages.js';
import { PrinterConfig } from './PrinterConfig.js';
import { EscPos } from '../Languages/EscPos/EscPos.js';
import { CmdTransmitPrinterId } from '../Languages/EscPos/CmdTransmitPrinterId.js';
import type { IPrinterCommand } from './Commands.js';

/**
 * Build an AwaitedCommand the same way ReceiptPrinter does, plus a spy so tests
 * can assert whether the caller was released or left hanging.
 */
function awaited(cmd: IPrinterCommand) {
  let resolve!: (v: boolean) => void;
  let reject!: (r?: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => { /* tests assert on the spies, not the promise */ });
  const resolveSpy = vi.fn(resolve);
  const record: Msgs.AwaitedCommand = { cmd, promise, resolve: resolveSpy, reject };
  return { record, resolveSpy };
}

/**
 * A 4-byte ESC/POS Automatic Status Back frame.
 *
 * Layout per the Epson reference (TM-T20 quick reference):
 *   first byte   0xx1 xx00   bit 3 = 1: Offline, 0: Online
 *   2nd byte     0xx0 x000
 *   3rd byte     0110 xx00
 *   4th byte     0110 1111
 */
const asbOnline  = () => new Uint8Array([0x10, 0x00, 0x60, 0x6f]);
const asbOffline = () => new Uint8Array([0x18, 0x00, 0x60, 0x6f]);

/** A Printer Info B reply: header 0x5f, payload, NUL terminator. */
function infoB(payload: string) {
  return new Uint8Array([0x5f, ...[...payload].map(c => c.charCodeAt(0)), 0x00]);
}
/** The "not prepared yet, still working on it" reply: just [header, NUL]. */
const infoBBusy = () => new Uint8Array([0x5f, 0x00]);

function setup() {
  return { cmdSet: new EscPos(), config: new PrinterConfig() };
}

describe('parseRaw candidate handling', () => {
  it('does not drop an awaited command when an unsolicited message arrives first', async () => {
    // The reported Windows failure: the printer pushes an ASB frame (cover
    // change, power-on, drawer) while a config query is in flight. The ASB is
    // not the reply we asked for, but that says nothing about whether our reply
    // is still coming, so the candidate must survive.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterId('InfoBModelName'));

    const result = await Msgs.parseRaw(asbOnline(), cmdSet, config, [record]);

    expect(result.remainderCommands).toHaveLength(1);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(result.remainderMsg).toHaveLength(0);
    expect(result.messages.some(m => m.messageType === 'StatusMessage')).toBe(true);
  });

  it('handles an unsolicited message coalesced ahead of the real reply', async () => {
    // Both arrive in a single USB transfer. The ASB must be consumed and the
    // reply behind it still matched, otherwise the awaited command times out
    // even though its answer was sitting right there in the buffer.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterId('InfoBModelName'));
    const buffer = new Uint8Array([...asbOnline(), ...infoB('TM-T88V')]);

    const result = await Msgs.parseRaw(buffer, cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(result.remainderCommands).toHaveLength(0);
    expect(result.remainderMsg).toHaveLength(0);
  });

  it('resolves the awaited command from a plain reply', async () => {
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterId('InfoBModelName'));

    const result = await Msgs.parseRaw(infoB('TM-T88V'), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(result.remainderCommands).toHaveLength(0);
    expect(result.remainderMsg).toHaveLength(0);
  });
});

describe('parseRaw buffer progress', () => {
  it('consumes the "printer busy" empty packet instead of poisoning the buffer', async () => {
    // [header, NUL] means "not prepared yet". If those two bytes are not
    // consumed they stay at the head of the buffer forever: every later parse
    // re-reads them, reports incomplete again, and never advances - which times
    // out not just this command but every operation after it.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterId('InfoBModelName'));

    const first = await Msgs.parseRaw(infoBBusy(), cmdSet, config, [record]);

    expect(first.remainderMsg).toHaveLength(0);
    expect(first.remainderCommands).toHaveLength(1);
    expect(resolveSpy).not.toHaveBeenCalled();

    // The real reply arrives next and must now be matched normally.
    const second = await Msgs.parseRaw(
      infoB('TM-T88V'), cmdSet, config, first.remainderCommands);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(second.remainderMsg).toHaveLength(0);
  });

  it('holds a partial reply intact until the rest arrives', async () => {
    // A USB transfer can split a reply anywhere, which is much more common on
    // Windows. The bytes we have must be handed back untouched, not consumed
    // by the unsolicited-message path.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterId('InfoBModelName'));
    const whole = infoB('TM-T88V');
    const head = whole.slice(0, 4);
    const tail = whole.slice(4);

    const first = await Msgs.parseRaw(head, cmdSet, config, [record]);

    expect(first.remainderMsg).toStrictEqual(head);
    expect(first.remainderCommands).toHaveLength(1);
    expect(resolveSpy).not.toHaveBeenCalled();

    const rejoined = new Uint8Array([...first.remainderMsg, ...tail]);
    const second = await Msgs.parseRaw(
      rejoined, cmdSet, config, first.remainderCommands);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(second.remainderMsg).toHaveLength(0);
  });

  it('drops a single byte for a reply nobody is waiting for', async () => {
    // A reply that arrives after its command already timed out. It used to
    // throw out of the read loop, which killed the input listener for good.
    // Now it must report an error and still make forward progress.
    const { cmdSet, config } = setup();

    const result = await Msgs.parseRaw(new Uint8Array([0x00, 0x00]), cmdSet, config, []);

    expect(result.remainderMsg).toHaveLength(0);
    expect(result.messages.every(m => m.messageType === 'ErrorMessage')).toBe(true);
    expect(result.messages).toHaveLength(2);
  });

  it('never throws on unparseable input', async () => {
    const { cmdSet, config } = setup();
    await expect(
      Msgs.parseRaw(new Uint8Array([0xff, 0xff]), cmdSet, config, [])
    ).resolves.toBeDefined();
  });

  it('terminates when a handler consumes nothing', async () => {
    // Guard against the loop spinning forever on a byte no one will consume.
    const { cmdSet, config } = setup();
    const stuck = {
      ...cmdSet,
      handleMessage: <T,>(msg: T) => ({
        messageIncomplete: false,
        messageMatchedExpectedCommand: false,
        messages: [],
        remainder: msg,
      }),
    } as unknown as Parameters<typeof Msgs.parseRaw>[1];

    const result = await Msgs.parseRaw(new Uint8Array([0x41, 0x42]), stuck, config, []);

    expect(result.remainderMsg).toHaveLength(2);
  });
});
