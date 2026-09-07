import { expect, describe, it, vi } from 'vitest';
import * as Mux from 'web-device-mux';
import { ReceiptPrinter } from './ReceiptPrinter.js';
import { RawMessageTransformer } from './Commands/Messages.js';
import { ReadyToPrintDocuments } from './ReadyToPrintDocuments.js';

/**
 * A channel that answers every query with a well-formed Printer Info B reply,
 * so `setup()` can complete without a real device.
 */
class FakeChannel implements Mux.IDeviceChannel<Uint8Array, Uint8Array> {
  public readonly channelType = 'USB' as const;
  public get commMode() { return Mux.ConnectionDirectionMode.bidirectional; }

  public connected = true;
  public sent: Uint8Array[] = [];
  public disposed = false;
  /** Set to have send() report a failure the way UsbDeviceChannel does. */
  public sendResult: Mux.DeviceCommunicationError | undefined = undefined;
  /** Set to stop answering, so awaited commands hit their timeout. */
  public replies = true;

  private pending: Uint8Array[] = [];

  async dispose() {
    this.disposed = true;
    this.connected = false;
    return Promise.resolve();
  }

  getDeviceInfo(): Promise<Mux.IDeviceInformation> {
    return Promise.resolve({
      manufacturerName: 'Test',
      productName: 'Fake Printer',
      serialNumber: '12345',
    });
  }

  send(data: Uint8Array): Promise<Mux.DeviceCommunicationError | undefined> {
    this.sent.push(data);
    if (this.sendResult === undefined && this.replies) {
      // Answer any GS I query with an Info B packet, and any GS r with a
      // paper-present byte.
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0x1d && data[i + 1] === 0x49) {
          this.pending.push(new Uint8Array([0x5f, 0x41, 0x00]));
        }
        if (data[i] === 0x1d && data[i + 1] === 0x72) {
          this.pending.push(new Uint8Array([0x00]));
        }
      }
    }
    return Promise.resolve(this.sendResult);
  }

  async receive(): Promise<Uint8Array[] | Mux.DeviceCommunicationError> {
    // Hand back whatever the last send queued up, then idle.
    const out = this.pending;
    this.pending = [];
    if (out.length === 0) {
      await new Promise(r => setTimeout(r, 5));
      return [];
    }
    return out;
  }
}

function makePrinter(channel: FakeChannel, timeoutMS = 200) {
  return ReceiptPrinter.fromChannel<Uint8Array>(
    channel,
    new RawMessageTransformer(),
    'Uint8Array',
    { debug: false, messageWaitTimeoutMS: timeoutMS },
  );
}

describe('ReceiptPrinter setup', () => {
  it('connects against a printer that answers', async () => {
    const channel = new FakeChannel();
    const printer = await makePrinter(channel);
    expect(printer.connected).toBe(true);
    await printer.dispose();
  });

  it('honours messageWaitTimeoutMS instead of the hardcoded default', async () => {
    // The option was declared but never read, so callers configuring a short
    // timeout silently waited the full 5s default.
    const channel = new FakeChannel();
    channel.replies = false;

    const started = Date.now();
    await expect(makePrinter(channel, 100)).rejects.toThrow();
    // 3 config attempts at ~100ms each. The old hardcoded 5s default would put
    // this well over 15 seconds.
    expect(Date.now() - started).toBeLessThan(3000);
  }, 20000);

  it('disposes the channel when setup fails', async () => {
    // Otherwise the USB interface stays claimed with nothing referencing it,
    // and the next connect attempt cannot claim it - the printer can't be
    // re-added without a physical replug.
    const channel = new FakeChannel();
    channel.replies = false;

    await expect(makePrinter(channel, 50)).rejects.toThrow();
    expect(channel.disposed).toBe(true);
  }, 20000);

  it('rejects rather than returning a half-built printer on a dead channel', async () => {
    const channel = new FakeChannel();
    channel.connected = false;
    await expect(makePrinter(channel)).rejects.toThrow(Mux.DeviceNotReadyError);
  });
});

describe('ReceiptPrinter error propagation', () => {
  it('surfaces a channel send failure instead of waiting for a timeout', async () => {
    // send() reports failure by RETURNING an error rather than throwing.
    // Discarding that value turns a write that never left the host into a
    // confusing timeout several seconds later.
    const channel = new FakeChannel();
    const printer = await makePrinter(channel);

    const sendError = new Mux.DeviceCommunicationError('USB write failed');
    channel.sendResult = sendError;

    const started = Date.now();
    await expect(printer.sendDocument(ReadyToPrintDocuments.getConfig))
      .rejects.toThrow('USB write failed');
    expect(Date.now() - started).toBeLessThan(150);

    await printer.dispose();
  });

  it('settles awaited commands on dispose rather than leaving them pending', async () => {
    const channel = new FakeChannel();
    const printer = await makePrinter(channel);
    channel.replies = false;

    const inFlight = printer.sendDocument(ReadyToPrintDocuments.getConfig);
    const caught = inFlight.catch((e: unknown) => e);
    await printer.dispose();

    await expect(caught).resolves.toBeInstanceOf(Error);
    expect(printer.connected).toBe(false);
  }, 20000);

  it('is safe to dispose more than once', async () => {
    const channel = new FakeChannel();
    const printer = await makePrinter(channel);
    await printer.dispose();
    await expect(printer.dispose()).resolves.toBeUndefined();
  });
});

describe('ReceiptPrinter transaction serialization', () => {
  it('does not interleave concurrent sends', async () => {
    // Two overlapping sends used to clobber the single `_awaitedCommands` slot:
    // the first call's awaiters were orphaned and the second's cleanup wiped
    // the slot, so later replies had nothing to match against.
    const channel = new FakeChannel();
    const printer = await makePrinter(channel);

    const spy = vi.spyOn(channel, 'send');
    const [a, b] = await Promise.all([
      printer.sendDocument(ReadyToPrintDocuments.getConfig),
      printer.sendDocument(ReadyToPrintDocuments.getConfig),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(spy).toHaveBeenCalled();

    await printer.dispose();
  }, 20000);
});
