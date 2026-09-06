import * as Util from '../../Util/index.js';
import * as Conf from '../../Configs/index.js';
import * as Cmds from '../../Commands/index.js';

const awaitsEffect = new Cmds.CommandEffectFlags(['waitsForResponse']);

export type TransmitPrinterStatusCmd
  = 'PaperSensorStatus'
  | 'DrawerKickStatus'
  //| 'InkSensorStatus'

export const transmitPrinterStatusCmdMap: Record<TransmitPrinterStatusCmd, number> = {
  PaperSensorStatus: 1, //49
  DrawerKickStatus : 2, //50
  // InkSensorStatus  : 4, //52
}

export class CmdTransmitPrinterStatus implements Cmds.IPrinterExtendedCommand {
  public static typeE = Symbol('TransmitPrinterStatus');
  typeExtended                 = CmdTransmitPrinterStatus.typeE;
  commandLanguageApplicability = Conf.PrinterCommandLanguage.escPos;
  name                         = 'Transmit Printer Status';
  type                         = "CustomCommand" as const;
  effectFlags                  = awaitsEffect;
  toDisplay() { return this.name; }

  constructor(public readonly subcommand: TransmitPrinterStatusCmd) {}
}

export const mappingCmdTransmitPrinterStatus: Cmds.IPrinterCommandMapping<Uint8Array> = {
  commandType: CmdTransmitPrinterStatus.typeE,
  transpile: handleCmdTransmitPrinterStatus,
  readMessage: parseCmdTransmitPrinterStatus,
  formInclusionMode: Cmds.CommandFormInclusionMode.noForm,
}

export function handleCmdTransmitPrinterStatus(
  cmd: Cmds.IPrinterCommand,
): Uint8Array {
  const command = cmd as CmdTransmitPrinterStatus;
  const argnum = transmitPrinterStatusCmdMap[command.subcommand];
  return new Uint8Array([
    // GS r <arg>
    Util.AsciiCodeNumbers.GS, 0x72, argnum,
  ]);
}

// Some paper sensors are not present, depending on the printer model.
// The names of some paper sensors are different, depending on the printer model.
enum PaperSensorByte {
  // Roll paper near end sensor: paper not present
  RollPaperNearEnd = 0x03,
  // Roll paper end sensor: paper not present
  RollPaperEnd     = 0x0c,
}

enum DrawerKickByte {
  // Drawer kick-out connector pin 3 state
  DrawerKickOut = 0x01,
}

// Only present on ink-based printers, uncommon.
// enum InkStatusByte {
//   // Ink near-end detected (1st color)
//   ColorOneNearEnd = 0x01,
//   // Ink near-end detected (2nd color)
//   ColorTwoNearEnd = 0x02,
// }

/**
 * Check a single GS r reply byte against what the spec allows for the
 * subcommand we asked about.
 *
 * Per the ESC/POS reference (as printed in the TM-T20 quick reference):
 *
 *     GS r n   Transmits status specified by n as 1 byte
 *     n = 1, "1": Paper sensor status
 *              Status = 0:  Paper end sensor: paper present
 *              Status = 12: Paper end sensor: not present
 *     n = 2, "2": Drawer kick-out connector status
 *              Status = 0: Drawer kick-out connector pin 3: Low
 *              Status = 1: Drawer kick-out connector pin 3: High
 *
 * Bits 4 and 7 are fixed 0 on every reply. Bits 5 and 6 are undefined, so they
 * are deliberately not checked. Paper sensor bits travel in pairs (0/1 for
 * near-end, 2/3 for end), and models without a near-end sensor report that
 * pair as 0.
 */
function isValidStatusByte(byte: number, subcommand: TransmitPrinterStatusCmd): boolean {
  // Bits 4 and 7 are fixed 0 for all GS r replies.
  if ((byte & 0x90) !== 0) { return false; }

  switch (subcommand) {
    case 'PaperSensorStatus': {
      // Each sensor reports through a pair of bits that must agree.
      const nearEnd = byte & 0x03;
      const end     = byte & 0x0c;
      return (nearEnd === 0x00 || nearEnd === 0x03)
          && (end     === 0x00 || end     === 0x0c);
    }
    case 'DrawerKickStatus':
      // Only bit 0 carries meaning; bits 1-3 are fixed 0.
      return (byte & 0x0e) === 0;
    default:
      return Util.exhaustiveMatchGuard(subcommand);
  }
}

export function parseCmdTransmitPrinterStatus(
  msg: Uint8Array,
  cmd: Cmds.IPrinterCommand,
): Cmds.IMessageHandlerResult<Uint8Array> {
  // https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lr.html
  if ((cmd as CmdTransmitPrinterStatus).typeExtended !== CmdTransmitPrinterStatus.typeE) {
    throw new Cmds.MessageParsingError(
      `Incorrect command '${cmd.name}' passed to parseTransmitPrinterStatus, expected 'TransmitPrinterStatus' instead.`,
      msg
    );
  }
  const result: Cmds.IMessageHandlerResult<Uint8Array> = {
    messageIncomplete: false,
    messageMatchedExpectedCommand: false,
    messages: [],
    remainder: msg
  }

  const command = (cmd as CmdTransmitPrinterStatus);

  const status: Cmds.IStatusMessage = {
    messageType: "StatusMessage",
    statuses: new Cmds.StatusStateSet(),
  }
  const error: Cmds.IErrorMessage = {
    messageType: "ErrorMessage",
    errors: new Cmds.ErrorStateSet(),
  }

  // Each status is 1 byte.
  const byte = msg[0];
  if (byte === undefined) {
    result.messageIncomplete = true;
    result.messageMatchedExpectedCommand = true;
    return result;
  }

  // Validate before claiming the byte. GS r replies carry fixed bits, and a
  // reply that doesn't match the subcommand we asked about is not ours - it
  // may be the late reply to a different query, or a desynchronized stream.
  // Claiming it unconditionally resolves the wrong awaiter with a fabricated
  // status, which surfaces as phantom paper-out and drawer events.
  if (!isValidStatusByte(byte, command.subcommand)) {
    return result;
  }

  result.messageMatchedExpectedCommand = true;
  result.remainder = msg.slice(1);

  switch (command.subcommand) {
    case 'PaperSensorStatus':
      if (Util.hasFlag(byte, PaperSensorByte.RollPaperNearEnd)) {
        error.errors.add(Cmds.ErrorState.MediaNearEnd);
      }
      if (Util.hasFlag(byte, PaperSensorByte.RollPaperEnd)) {
        error.errors.add(Cmds.ErrorState.MediaEmpty);
      }
      if (error.errors.size > 0) { result.messages.push(error); }
      break;
    case 'DrawerKickStatus':
      if (Util.hasFlag(byte, DrawerKickByte.DrawerKickOut)) {
        status.statuses.add(Cmds.StatusState.DrawerOpen);
      }
      if (status.statuses.size > 0) { result.messages.push(status); }
      break;
    // case 'InkSensorStatus':
    //   status.colorOneLow = hasFlag(byte, InkStatusByte.ColorOneNearEnd);
    //   status.colorTwoLow = hasFlag(byte, InkStatusByte.ColorTwoNearEnd);
    //   break;
  }

  return result;
}
