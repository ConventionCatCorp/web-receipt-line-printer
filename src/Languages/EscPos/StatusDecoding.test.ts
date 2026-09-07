import { expect, describe, it, vi } from 'vitest';
import * as Msgs from '../../Commands/Messages.js';
import { PrinterConfig } from '../../Commands/PrinterConfig.js';
import { EscPos } from './EscPos.js';
import { CmdTransmitPrinterStatus } from './CmdTransmitPrinterStatus.js';
import type { IPrinterCommand } from '../../Commands/Commands.js';

function awaited(cmd: IPrinterCommand) {
  let resolve!: (v: boolean) => void;
  let reject!: (r?: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => { /* tests assert on the spy, not the promise */ });
  const resolveSpy = vi.fn(resolve);
  const record: Msgs.AwaitedCommand = { cmd, promise, resolve: resolveSpy, reject };
  return { record, resolveSpy };
}

/**
 * A 4-byte ESC/POS Automatic Status Back frame.
 *
 * Layout per the Epson ESC/POS reference for GS a, as printed in the TM-T20
 * quick reference:
 *
 *   first byte   0xx1 xx00   bit 2 = 1: Drawer kick-out connector pin 3: High
 *                            bit 3 = 1: in Offline, 0: in Online
 *                            bit 5 = 1: Cover is open, 0: closed
 *                            bit 6 = 1: on feeding paper by switch
 *   2nd byte     0xx0 x000   bit 3 = 1: Autocutter error
 *                            bit 5 = 1: Unrecoverable error
 *                            bit 6 = 1: Automatically recoverable error
 *   3rd byte     0110 xx00   bit 0,1 = 1: Roll paper near end
 *                            bit 2,3 = 1: Paper end
 *   4th byte     0110 1111
 */
const asb = (first: number, second = 0x00, third = 0x60, fourth = 0x6f) =>
  new Uint8Array([first, second, third, fourth]);

function setup() {
  return { cmdSet: new EscPos(), config: new PrinterConfig() };
}

function statusesOf(messages: Msgs.PrinterMessage[]) {
  return messages
    .filter(m => m.messageType === 'StatusMessage')
    .flatMap(m => [...m.statuses]);
}

function errorsOf(messages: Msgs.PrinterMessage[]) {
  return messages
    .filter(m => m.messageType === 'ErrorMessage')
    .flatMap(m => [...m.errors]);
}

describe('ASB online/offline polarity', () => {
  it('reports online when bit 3 is clear', async () => {
    const { cmdSet, config } = setup();
    const result = await Msgs.parseRaw(asb(0x10), cmdSet, config, []);

    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.PrinterOnline);
    expect(statusesOf(result.messages)).not.toContain(Msgs.StatusState.PrinterOffline);
  });

  it('reports offline when bit 3 is set', async () => {
    // "bit 3 = 1: in Offline, 0: in Online". Reading a set bit as "online"
    // inverts the single most important status the printer reports, so a
    // printer that has gone offline looks healthy.
    const { cmdSet, config } = setup();
    const result = await Msgs.parseRaw(asb(0x18), cmdSet, config, []);

    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.PrinterOffline);
    expect(statusesOf(result.messages)).not.toContain(Msgs.StatusState.PrinterOnline);
  });
});

describe('ASB flag decoding', () => {
  it('reports a cover-open frame', async () => {
    const { cmdSet, config } = setup();
    // Cover open forces the printer offline too.
    const result = await Msgs.parseRaw(asb(0x38), cmdSet, config, []);

    expect(errorsOf(result.messages)).toContain(Msgs.ErrorState.PrintheadUp);
    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.PrinterOffline);
  });

  it('reports the drawer kick pin state', async () => {
    const { cmdSet, config } = setup();
    expect(statusesOf((await Msgs.parseRaw(asb(0x14), cmdSet, config, [])).messages))
      .toContain(Msgs.StatusState.DrawerOpen);
    expect(statusesOf((await Msgs.parseRaw(asb(0x10), cmdSet, config, [])).messages))
      .not.toContain(Msgs.StatusState.DrawerOpen);
  });

  it('reports paper end from the third byte', async () => {
    const { cmdSet, config } = setup();
    const result = await Msgs.parseRaw(asb(0x10, 0x00, 0x6c), cmdSet, config, []);
    expect(errorsOf(result.messages)).toContain(Msgs.ErrorState.MediaEmpty);
  });

  it('reports an unrecoverable error from the second byte', async () => {
    const { cmdSet, config } = setup();
    const result = await Msgs.parseRaw(asb(0x10, 0x20), cmdSet, config, []);
    expect(errorsOf(result.messages)).toContain(Msgs.ErrorState.UnrecoverableError);
  });
});

describe('ASB frame resynchronization', () => {
  it('does not decode a frame whose trailing bytes are invalid', async () => {
    // The invalid-trailer branch used to report the error and then fall through
    // and decode the garbage anyway, emitting fabricated paper-out and
    // unrecoverable-error events to the application.
    const { cmdSet, config } = setup();
    // 0x9c has bit 7 set, so it cannot be an ASB trailer byte. Its low bits
    // would otherwise decode as paper-end.
    const result = await Msgs.parseRaw(
      new Uint8Array([0x10, 0x9c, 0x9c, 0x9c]), cmdSet, config, []);

    expect(errorsOf(result.messages)).not.toContain(Msgs.ErrorState.MediaEmpty);
    expect(errorsOf(result.messages)).toContain(Msgs.ErrorState.MessageReceiveException);
  });

  it('resynchronizes after a single lost byte', async () => {
    // Consuming the full four bytes on a bad frame shifts the desync along
    // instead of correcting it, so one lost byte corrupts every frame after it.
    // Dropping one byte at a time lets the next real header line up.
    const { cmdSet, config } = setup();
    const stray = new Uint8Array([0x10, 0x9c, ...asb(0x18)]);

    const result = await Msgs.parseRaw(stray, cmdSet, config, []);

    expect(result.remainderMsg).toHaveLength(0);
    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.PrinterOffline);
  });

  it('waits for the rest of a partial frame', async () => {
    const { cmdSet, config } = setup();
    const result = await Msgs.parseRaw(new Uint8Array([0x10, 0x00]), cmdSet, config, []);

    expect(result.remainderMsg).toStrictEqual(new Uint8Array([0x10, 0x00]));
    expect(result.messages).toHaveLength(0);
  });
});

describe('GS r reply validation', () => {
  it('rejects a reply that cannot belong to the subcommand asked about', async () => {
    // 0x0c is a paper-end reply. Bits 1-3 are fixed 0 on a drawer reply, so it
    // cannot be one; claiming it anyway resolves the drawer query with a
    // fabricated status.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('DrawerKickStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x0c]), cmdSet, config, [record]);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(result.remainderCommands).toHaveLength(1);
  });

  it('accepts a paper sensor reply for a paper sensor query', async () => {
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('PaperSensorStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x0c]), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(result.remainderMsg).toHaveLength(0);
    expect(errorsOf(result.messages)).toContain(Msgs.ErrorState.MediaEmpty);
  });

  it('accepts a drawer reply for a drawer query', async () => {
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('DrawerKickStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x01]), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.DrawerOpen);
  });

  it('accepts a drawer reply that reports the pin as a bit pair', async () => {
    // A TH230 answers GS r 2 with 0x03, not Epson's 0x01. That failed
    // validation, so nothing claimed the byte and the document timed out.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('DrawerKickStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x03]), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(result.remainderMsg).toHaveLength(0);
    expect(statusesOf(result.messages)).toContain(Msgs.StatusState.DrawerOpen);
  });

  it('accepts a paper reply with the undefined bits set', async () => {
    // The same printer answers GS r 1 with 0x60; bits 5 and 6 are undefined
    // and must not read as a tripped sensor.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('PaperSensorStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x60]), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(errorsOf(result.messages)).toHaveLength(0);
  });

  it('still rejects a paper end reply for a drawer query', async () => {
    // Bits 2 and 3 stay the discriminator: widening the pin check must not
    // let a paper reply claim a drawer query.
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('DrawerKickStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x0f]), cmdSet, config, [record]);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(result.remainderCommands).toHaveLength(1);
  });

  it('reports paper adequate without inventing errors', async () => {
    const { cmdSet, config } = setup();
    const { record, resolveSpy } = awaited(new CmdTransmitPrinterStatus('PaperSensorStatus'));

    const result = await Msgs.parseRaw(new Uint8Array([0x00]), cmdSet, config, [record]);

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(errorsOf(result.messages)).toHaveLength(0);
  });
});
