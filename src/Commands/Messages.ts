import * as Util from '../Util/index.js';
import * as Conf from '../Configs/index.js';
import type { IDeviceInformation } from "web-device-mux";
import type { IPrinterCommand } from "./Commands.js";
import type { CommandSet } from './CommandSet.js';
import type { PrinterConfig } from './PrinterConfig.js';

export type PrinterMessage
  = ISettingUpdateMessage
  | IStatusMessage
  | IErrorMessage

export type MessageType = 'SettingUpdateMessage' | 'StatusMessage' | 'ErrorMessage'

export interface MessageTransformer<TMessage extends Conf.MessageArrayLike> {
  transformerType: Conf.MessageArrayLikeType;
  combineMessages(...messages: TMessage[]): TMessage;

  messageToString(message: TMessage): string;
  messageToUint8Array(message: TMessage): Uint8Array;
}

export class RawMessageTransformer implements MessageTransformer<Uint8Array> {
  transformerType: Conf.MessageArrayLikeType = "Uint8Array";

  combineMessages(...messages: Uint8Array[]): Uint8Array {
    const bufferLen = messages.reduce((sum, arr) => sum + arr.byteLength, 0);
    return messages.reduce(
      (accumulator, arr) => {
        accumulator.buffer.set(arr, accumulator.offset);
        return { ...accumulator, offset: arr.byteLength + accumulator.offset };
      },
      { buffer: new Uint8Array(bufferLen), offset: 0 }
    ).buffer;
  }

  messageToString(message: Uint8Array): string {
    return asString(message);
  }

  messageToUint8Array(message: Uint8Array): Uint8Array {
    return message;
  }
}

export class StringMessageTransformer implements MessageTransformer<string> {
  transformerType: Conf.MessageArrayLikeType = "string";

  combineMessages(...messages: string[]): string {
    return messages.join('');
  }
  messageToString(message: string): string {
    return message;
  }
  messageToUint8Array(message: string): Uint8Array {
    return asUint8Array(message);
  }
}

export function asUint8Array(commands: Conf.MessageArrayLike): Uint8Array {
  if (typeof commands === "string") {
    // Must NOT be TextEncoder: that emits UTF-8, so every codepage byte above
    // 0x7F becomes two or three bytes and the printer receives garbage.
    // EncodeAscii is the exact inverse of Util.DecodeAscii, which is what
    // asString uses, so the two round-trip losslessly.
    return Util.EncodeAscii(commands);
  } else if (commands instanceof Uint8Array) {
    return commands;
  } else {
    throw new Error("Unknown message type not implemented!");
  }
}

export function asString(commands: Conf.MessageArrayLike): string {
  if (typeof commands === "string") {
    return commands;
  } else if (commands instanceof Uint8Array) {
    return Util.DecodeAscii(commands);
  } else {
    throw new Error("Unknown message type not implemented!");
  }
}

export function asTargetMessageType<TMessage extends Conf.MessageArrayLike>(
  msg: Conf.MessageArrayLike,
  targetType: TMessage,
): TMessage {
  if (typeof targetType === "string") {
    return asString(msg) as TMessage;
  } else if (targetType instanceof Uint8Array) {
    return asUint8Array(msg) as TMessage;
  } else {
    throw new Error("Unknown message type not implemented!");
  }
}

export type AwaitedCommand = {
  cmd: IPrinterCommand,
  promise: Promise<boolean>,
  resolve?: (value: boolean) => void,
  reject?: (reason?: unknown) => void,
}

/** A printer settings message, describing printer configuration status. */
export interface ISettingUpdateMessage {
  messageType: 'SettingUpdateMessage';

  printerHardware?: Conf.UpdateFor<Conf.IPrinterHardware>;
  printerMedia   ?: Conf.UpdateFor<Conf.IPrinterMedia>;
}

export enum StatusState {
  PrinterOnline = "PrinterOnline",
  /**
   * The printer reported itself offline. Note that this is a distinct state
   * from "not connected": the transport is fine, the printer is telling us it
   * cannot print right now (cover open, paper out, recovery pending, ...).
   */
  PrinterOffline = "PrinterOffline",
  PaperButtonFeedingPaper = "PaperButtonFeedingPaper",
  DrawerOpen = "DrawerOpen",
}
export type StatusStates = keyof typeof StatusState;
export class StatusStateSet extends Set<StatusState> {}

/** A status message sent by the printer. */
export interface IStatusMessage {
  messageType: 'StatusMessage'

  /** Any status notes provided by the printer. */
  statuses: StatusStateSet,
}

export enum ErrorState {
  NoError      = "NoError",
  UnknownError = "UnknownError",

  // User-generated errors
  CommandSyntaxError                 = "CommandSyntaxError",
  ObjectExceededLabelBorder          = "ObjectExceededLabelBorder",
  BarCodeDataLengthError             = "BarCodeDataLengthError",
  InsufficientMemoryToStoreData      = "InsufficientMemoryToStoreData",
  DuplicateNameFormGraphicOrSoftFont = "DuplicateNameFormGraphicOrSoftFont",
  NameNotFoundFormGraphicOrSoftFont  = "NameNotFoundFormGraphicOrSoftFont",
  NotInDataEntryMode                 = "NotInDataEntryMode",
  PDF417CodedDataTooLargeToFit       = "PDF417CodedDataTooLargeToFit",
  ReceiveBufferFull                  = "ReceiveBufferFull",
  PresenterNotRunning                = "PresenterNotRunning",

  // Physical problems with the device
  MemoryConfigurationError = "MemoryConfigurationError",
  RS232InterfaceError      = "RS232InterfaceError",
  CorruptRamConfigLost     = "CorruptRamConfigLost",
  InvalidFirmwareConfig    = "InvalidFirmwareConfig",
  PrintheadThermistorOpen  = "PrintheadThermistorOpen",
  PrintheadDetectionError  = "PrintheadDetectionError",
  BadPrintheadElement      = "BadPrintheadElement",
  IllegalInterruptOccurred = "IllegalInterruptOccurred",

  // Errors that need user action to resolve
  PrintheadUp = "PrintheadUp",

  MediaEmpty  = "MediaEmptyError",
  MediaNearEnd     = "MediaNearEnd",
  RibbonEmptyError = "RibbonEmptyError",

  PrintheadTooHot  = "PrintheadTooHot",
  PrintheadTooCold = "PrintheadTooCold",
  MotorTooHot      = "MotorTooHot",
  MotorTooCold     = "MotorTooCold",
  //MotorJuuuuuuuustRight

  BatteryLowWarning40Percent = "BatteryLowWarning40Percent",
  BatteryLowLimit20Percent   = "BatteryLowLimit20Percent",

  CutterJammedOrNotInstalled = "CutterJammedOrNotInstalled",
  PressFeedButtonToRecover   = "PressFeedButtonToRecover",
  PaperFeedError             = "PaperFeedError",
  PaperJamDuringRetract      = "PaperJamDuringRetract",
  UnrecoverableError         = "UnrecoverableError",

  PrintheadNeedsCleaning  = "PrintheadNeedsCleaning",
  PrintheadNeedsReplacing = "PrintheadNeedsReplacing",

  // Media calibration errors
  MediaErrorOrBlacklineNotDetectedOrExcessiveMediaFeeding = "MediaErrorOrBlacklineNotDetectedOrExcessiveMediaFeeding",

  BlackMarkNotFound        = "BlackMarkNotFound",
  BlackMarkCalirateError   = "BlackMarkCalirateError",
  AutoSenseOrSensorFailure = "AutoSenseOrSensorFailure",
  ExcessiveMediaFeeding    = "ExcessiveMediaFeeding",
  RetractFunctionTimeout   = "RetractFunctionTimeout",
  NeedToCalibrateMedia     = "NeedToCalibrateMedia",

  // Statuses
  PrinterBusyProcessingPrintJob = "PrinterBusyProcessingPrintJob",
  PrinterPaused                 = "PrinterPaused",
  PartialFormatInProgress       = "PartialFormatInProgress",
  CommDiagnosticModeActive      = "CommDiagnosticModeActive",
  LabelWaitingToBeTaken         = "LabelWaitingToBeTaken",

  // General library errors
  MessageReceiveException = "MessageReceiveException",
}
export type ErrorStates = keyof typeof ErrorState;
export class ErrorStateSet extends Set<ErrorState> {}

/** An error message sent by the printer. */
export interface IErrorMessage {
  messageType: 'ErrorMessage',

  /** Any error notes that prevent the printer from printing. */
  errors: ErrorStateSet,

  exceptions?: Error[],
}

/** The output of a function for parsing a message. */
export interface IMessageHandlerResult<TInput> {
  messageIncomplete: boolean,
  messageMatchedExpectedCommand: boolean,
  messages: PrinterMessage[],
  remainder: TInput
}

export type CommandSetMessageHandlerDelegate<TMsgType extends Conf.MessageArrayLike> =
  <TReceived extends Conf.MessageArrayLike>(
    cmdSet: CommandSet<TMsgType>,
    message: TReceived,
    config: PrinterConfig,
    sentCommand?: IPrinterCommand
  ) => IMessageHandlerResult<TReceived>;

/** An error indicating a problem parsing a received message. */
export class MessageParsingError extends Util.WebReceiptLineError {
  public readonly receivedMessage: Conf.MessageArrayLike;
  constructor(message: string, receivedMessage: Conf.MessageArrayLike) {
    super(message);
    this.receivedMessage = receivedMessage;
  }
}

export function deviceInfoToOptionsUpdate(deviceInfo: IDeviceInformation): ISettingUpdateMessage {
  return {
    messageType: 'SettingUpdateMessage',
    printerHardware: {
      serialNumber: deviceInfo.serialNumber,
      model: deviceInfo.productName,
      manufacturer: deviceInfo.manufacturerName
    },
    printerMedia: {}
  }
}

// Kept async for API compatibility: this is exported and every caller awaits it.
// eslint-disable-next-line @typescript-eslint/require-await
export async function parseRaw<TInput extends Conf.MessageArrayLike>(
  input: TInput,
  commandSet: CommandSet<Conf.MessageArrayLike>,
  config: PrinterConfig,
  awaitedCommands: AwaitedCommand[]
): Promise<{ remainderMsg: TInput; remainderCommands: AwaitedCommand[], messages: PrinterMessage[]; }> {
  let remainderMsg = input;
  if (remainderMsg.length === 0) { return { messages: [], remainderCommands: awaitedCommands, remainderMsg}; }
  const messages: PrinterMessage[] = [];

  const remainderCommands = awaitedCommands.slice();

  // Consume the buffer from the front until we run out of data, run out of
  // progress, or hit a partial message we need more bytes to finish.
  // Every path that needs more bytes breaks out directly, so the loop only has
  // to check that there is still something left to look at.
  while (remainderMsg.length > 0) {
    // Offer the head of the buffer to each awaited command in turn. The first
    // one that claims it wins; anything that doesn't match is left alone.
    //
    // A candidate that does NOT match must never be dropped: the printer is
    // free to interleave unsolicited messages (ASB) with solicited replies, so
    // "this isn't your reply" says nothing about whether the reply is still
    // coming. Dropping it here strands the caller until its timeout fires.
    let claimedBy: AwaitedCommand | undefined;
    let claimResult: IMessageHandlerResult<TInput> | undefined;
    for (const c of remainderCommands) {
      const parseResult = commandSet.handleMessage(remainderMsg, config, c.cmd);

      // Check incompleteness FIRST. A parser that has recognised its own reply
      // but needs more bytes may not have set messageMatchedExpectedCommand
      // yet, and treating that as "no match" would hand a half-read reply to
      // the unsolicited path below, which would eat a byte out of it.
      if (parseResult.messageIncomplete) {
        claimedBy = c;
        claimResult = parseResult;
        break;
      }
      if (parseResult.messageMatchedExpectedCommand) {
        claimedBy = c;
        claimResult = parseResult;
        break;
      }
    }

    if (claimedBy !== undefined && claimResult !== undefined) {
      // Always honour whatever the parser consumed, even when it reports the
      // message as incomplete. A parser may legitimately discard a complete
      // but empty packet (such as an ESC/POS "still working on it" reply) and
      // then ask for more data. Ignoring its remainder in that case leaves
      // those bytes at the head of the buffer forever, and every subsequent
      // parse re-reads them and reports incomplete again - a poisoned buffer
      // that times out every future operation on this printer.
      if (claimResult.remainder.length < remainderMsg.length) {
        remainderMsg = claimResult.remainder;
        claimResult.messages.forEach(m => messages.push(m));
      }

      if (claimResult.messageIncomplete) {
        // Keep the candidate queued and wait for the rest of its reply.
        break;
      }

      // Fully handled: retire the candidate and let its caller continue.
      remainderCommands.splice(remainderCommands.indexOf(claimedBy), 1);
      if (claimedBy.resolve === undefined) {
        console.error('Resolve callback was undefined for awaited command, this may cause a deadlock! This is a bug in the library.');
      } else {
        claimedBy.resolve(true);
      }
      continue;
    }

    // Nothing we asked for. Treat it as an unsolicited message.
    const rawResult = commandSet.handleMessage(remainderMsg, config);
    rawResult.messages.forEach(m => messages.push(m));
    if (rawResult.messageIncomplete) {
      if (rawResult.remainder.length < remainderMsg.length) {
        remainderMsg = rawResult.remainder;
      }
      break;
    }
    if (rawResult.remainder.length >= remainderMsg.length) {
      // The handler consumed nothing and reported no error. Continuing would
      // spin forever on the same byte, so stop and hand the buffer back.
      break;
    }
    remainderMsg = rawResult.remainder;
  }

  return { remainderMsg, remainderCommands, messages }
}

/**
 * Slice an array from the start to the first LF character, returning both pieces.
 *
 * If no LF character is found sliced will have a length of 0.
 *
 * CR characters are not removed if present!
 */
export function sliceToNewline(msg: Uint8Array): {
  sliced: Uint8Array,
  remainder: Uint8Array,
} {
  const idx = msg.indexOf(Util.AsciiCodeNumbers.LF);
  if (idx === -1) {
    return {
      sliced: new Uint8Array(),
      remainder: msg
    }
  }

  return {
    sliced: msg.slice(0, idx + 1),
    remainder: msg.slice(idx + 1),
  };
}

/** Slice a string from the start to the first CRLF or LF, returning both pieces. */
export function sliceToCRLF(msg: string): {
  sliced: string,
  remainder: string,
} {
  const cr = msg.indexOf('\r\n');
  if (cr !== -1) {
    return {
      sliced: msg.substring(0, cr),
      remainder: msg.substring(cr + 2)
    }
  }

  const lf = msg.indexOf('\n');
  if (lf !== -1) {
    return {
      sliced: msg.substring(0, lf),
      remainder: msg.substring(lf + 1)
    }
  }

  return {
    sliced: "",
    remainder: msg
  }
}
