import * as Util from '../../Util/index.js';
import * as Conf from '../../Configs/index.js';
import * as Cmds from '../../Commands/index.js';
import { MessageCandidates } from './Messages.js';

export interface AutoStatusBackSetting {
  drawerKickStatus: boolean,
  onlineStatus: boolean,
  errorStatus: boolean,
  rollPaperStatus: boolean,
  panelSwitchStatus: boolean,
}

export class CmdSetAutoStatusBack implements Cmds.IPrinterExtendedCommand {
  public static typeE = Symbol("CmdSetAutoStatusBack");
  typeExtended                 = CmdSetAutoStatusBack.typeE;
  commandLanguageApplicability = Conf.PrinterCommandLanguage.escPos;
  name                         = 'Set Automatic Status Back setting'
  type                         = 'CustomCommand' as const;
  effectFlags                  = Cmds.NoEffect;
  toDisplay() { return this.name; }

  constructor(public readonly settings: AutoStatusBackSetting = {
    drawerKickStatus : true,
    errorStatus      : true,
    onlineStatus     : true,
    panelSwitchStatus: true,
    rollPaperStatus  : true
  }) {}
}

export const mappingCmdSetAutoStatusBack: Cmds.IPrinterCommandMapping<Uint8Array> = {
  commandType: CmdSetAutoStatusBack.typeE,
  transpile: handleCmdSetAutoStatusBack,
  readMessage: parseCmdSetAutoStatusBack,
  formInclusionMode: Cmds.CommandFormInclusionMode.noForm,
}

export function handleCmdSetAutoStatusBack(
  cmd: Cmds.IPrinterCommand,
): Uint8Array {
  const settings = (cmd as CmdSetAutoStatusBack).settings;
  let setting = 0x00;
  setting |= (settings.drawerKickStatus  ? 0x01 : 0x00);
  setting |= (settings.onlineStatus      ? 0x02 : 0x00);
  setting |= (settings.errorStatus       ? 0x04 : 0x00);
  setting |= (settings.rollPaperStatus   ? 0x08 : 0x00);
  setting |= (settings.panelSwitchStatus ? 0x40 : 0x00);
  return new Uint8Array([
    // GS a <arg>
    Util.AsciiCodeNumbers.GS, 0x61, setting,
  ])
}

// Bit layouts below are taken from the Epson ESC/POS reference for GS a, as
// printed in the TM-T20 quick reference:
//
//   first byte   0xx1 xx00
//                bit 2 = 1: Drawer kick-out connector pin 3: High
//                      = 0: Drawer kick-out connector pin 3: Low
//                bit 3 = 1: in Offline, 0: in Online
//                bit 5 = 1: Cover is open, 0: closed
//                bit 6 = 1: on feeding paper by switch, 0: not
//   2nd byte     0xx0 x000
//                bit 3 = 1: Autocutter error, 0: not
//                bit 5 = 1: Unrecoverable error, 0: not
//                bit 6 = 1: Automatically recoverable error, 0: not
//   3rd byte     0110 xx00  (models without a near-end sensor)
//                bit 0, 1 = 1: Roll paper near end, 0: paper adequate
//                bit 2, 3 = 1: Paper end, 0: paper present
//   4th byte     0110 1111

enum FirstAsbByte {
  /** Drawer kick-out connector pin 3 is HIGH. */
  DrawerKickPinHigh = 0x04,
  /**
   * Set when the printer is OFFLINE. Note the polarity: the spec reads
   * "bit 3 = 1: in Offline, 0: in Online", so a set bit is bad news.
   */
  PrinterOffline    = 0x08,
  CoverOpen         = 0x20,
  PaperFedByButton  = 0x40,
}

enum SecondAsbByte {
  // Bits 0, 1, 2 are fixed 0 in basic ASB. The "waiting for online recovery",
  // "paper feed button pushed" and "recoverable error" flags that used to be
  // mapped here belong to DLE EOT n=2 (offline cause status) and FS ( e
  // (extended ASB), not to GS a, so they could never fire from this byte.
  AutocutterError               = 0x08,
  UnrecoverableError            = 0x20,
  AutomaticallyRecoverableError = 0x40,
}

enum ThirdAsbByte {
  RollPaperNearEnd = 0x03,
  RollPaperEnd     = 0x0c,
}

export function parseCmdSetAutoStatusBack(
  msg: Uint8Array,
): Cmds.IMessageHandlerResult<Uint8Array> {
  // https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_la.html
  const result: Cmds.IMessageHandlerResult<Uint8Array> = {
    messageIncomplete: false,
    messageMatchedExpectedCommand: false,
    messages: [],
    remainder: msg,
  }

  // ASB is always 4 bytes, header of 0**1**00, trailer of 0**0****.
  // We need the next 3 bytes, make sure they're there.
  if (msg.length < 4) {
    result.messageIncomplete = true;
    return result;
  }

  // Confirm the next 3 bytes are trailers.
  const [first, second, third, fourth] = msg as unknown as [number, number, number, number];
  if ( (second & 0x90) !== MessageCandidates.ASB2to4
    || (third  & 0x90) !== MessageCandidates.ASB2to4
    || (fourth & 0x90) !== MessageCandidates.ASB2to4
  ) {
    // The first byte looked like an ASB header but the rest of the frame does
    // not agree, so we are out of sync with the stream. Consume a single byte
    // rather than the whole four: dropping four would shift the desync along
    // instead of correcting it, and one bad byte would then corrupt every
    // frame that follows it. Advancing by one lets the next real header line
    // up on the following pass.
    result.remainder = msg.slice(1);
    result.messages.push({
      messageType: 'ErrorMessage',
      errors: new Cmds.ErrorStateSet([Cmds.ErrorState.MessageReceiveException]),
      exceptions: [
        new Cmds.MessageParsingError(
          `First byte is an ASB (${Util.hex(first)}) but following bytes aren't (${Util.hex(second)} ${Util.hex(third)} ${Util.hex(fourth)}). Discarding one byte to resynchronize.`,
          msg,
        )
      ],
    });
    // Discard the frame. Decoding it anyway would emit fabricated paper-out and
    // unrecoverable-error events built from bytes we already know are garbage.
    return result;
  }

  result.remainder = msg.slice(4);

  const statuses = new Cmds.StatusStateSet();

  // Bit 3 set means OFFLINE, so online is the *absence* of the flag.
  if (Util.hasFlag(first, FirstAsbByte.PrinterOffline)) {
    statuses.add(Cmds.StatusState.PrinterOffline);
  } else {
    statuses.add(Cmds.StatusState.PrinterOnline);
  }
  if (Util.hasFlag(first, FirstAsbByte.PaperFedByButton)) {
    statuses.add(Cmds.StatusState.PaperButtonFeedingPaper);
  }
  // The spec reports the raw pin level, not a drawer state. High means open on
  // the usual wiring, which is what every drawer we know of does.
  if (Util.hasFlag(first, FirstAsbByte.DrawerKickPinHigh)) {
    statuses.add(Cmds.StatusState.DrawerOpen);
  }
  if (statuses.size > 0) {
    result.messages.push({
      messageType: 'StatusMessage',
      statuses,
    });
  }

  const errors = new Cmds.ErrorStateSet();
  if (Util.hasFlag(first, FirstAsbByte.CoverOpen)) {
    errors.add(Cmds.ErrorState.PrintheadUp);
  }
  if (Util.hasFlag(third, ThirdAsbByte.RollPaperNearEnd)) {
    errors.add(Cmds.ErrorState.MediaNearEnd);
  }
  if (Util.hasFlag(third, ThirdAsbByte.RollPaperEnd)) {
    errors.add(Cmds.ErrorState.MediaEmpty);
  }
  if (Util.hasFlag(second, SecondAsbByte.AutocutterError)) {
    errors.add(Cmds.ErrorState.CutterJammedOrNotInstalled);
  }
  if (Util.hasFlag(second, SecondAsbByte.UnrecoverableError)) {
    errors.add(Cmds.ErrorState.UnrecoverableError);
  }
  if (Util.hasFlag(second, SecondAsbByte.AutomaticallyRecoverableError)) {
    errors.add(Cmds.ErrorState.PressFeedButtonToRecover);
  }
  if (errors.size > 0) {
    result.messages.push({
      messageType: 'ErrorMessage',
      errors,
    });
  }

  return result;
}
