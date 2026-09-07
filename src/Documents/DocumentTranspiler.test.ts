import { expect, describe, it } from 'vitest';
import {ReadyToPrintDocuments} from '../ReadyToPrintDocuments.js';
import { getNewTranspileState, PrinterConfig, type TranspiledDocumentState } from '../Commands/index.js';
import { transpileDocument } from './DocumentTranspiler.js';
import { EscPos } from '../Languages/index.js';

function getFakeState(): TranspiledDocumentState {
  return getNewTranspileState(new PrinterConfig());
}

describe('DocumentTranspiler', () => {
  describe('escpos', () => {
    const escpos = new EscPos.EscPos();

    describe('ReadyToPrint Docs', () => {
      it('configDocument', () => {
        const state = getFakeState();
        expect(transpileDocument(ReadyToPrintDocuments.getConfig, escpos, state))
          .toMatchInlineSnapshot(`
            CompiledDocument {
              "effects": Set {
                "waitsForResponse",
              },
              "language": 1,
              "transactions": [
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterId {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer ID",
                      "subcommand": "TypeID",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(CmdTransmitPrinterId),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    73,
                    2,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterId {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer ID",
                      "subcommand": "InfoBMakerName",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(CmdTransmitPrinterId),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    73,
                    66,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterId {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer ID",
                      "subcommand": "InfoBModelName",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(CmdTransmitPrinterId),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    73,
                    67,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterId {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer ID",
                      "subcommand": "InfoBSerialNo",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(CmdTransmitPrinterId),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    73,
                    68,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterId {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer ID",
                      "subcommand": "InfoBFirmwareVersion",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(CmdTransmitPrinterId),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    73,
                    65,
                  ],
                },
              ],
            }
          `);
      });

      it('printerStatus', () => {
        const state = getFakeState();
        expect(transpileDocument(ReadyToPrintDocuments.getStatus, escpos, state))
          .toMatchInlineSnapshot(`
            CompiledDocument {
              "effects": Set {
                "waitsForResponse",
              },
              "language": 1,
              "transactions": [
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "PaperSensorStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    1,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "DrawerKickStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    2,
                  ],
                },
              ],
            }
          `);
      });

      it('printerStatus', () => {
        const state = getFakeState();
        expect(transpileDocument(ReadyToPrintDocuments.feedMedia, escpos, state))
          .toMatchInlineSnapshot(`
            CompiledDocument {
              "effects": Set {
                "feedsPaper",
                "waitsForResponse",
              },
              "language": 1,
              "transactions": [
                Transaction {
                  "awaitedCommands": [],
                  "commands": Uint8Array [
                    10,
                    10,
                    10,
                    10,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "PaperSensorStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    1,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "DrawerKickStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    2,
                  ],
                },
              ],
            }
          `);
      });

      it('printerStatus', () => {
        const state = getFakeState();
        expect(transpileDocument(ReadyToPrintDocuments.printConfig, escpos, state))
          .toMatchInlineSnapshot(`
            CompiledDocument {
              "effects": Set {
                "feedsPaper",
                "waitsForResponse",
              },
              "language": 1,
              "transactions": [
                Transaction {
                  "awaitedCommands": [],
                  "commands": Uint8Array [
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    10,
                    80,
                    114,
                    105,
                    110,
                    116,
                    101,
                    114,
                    32,
                    115,
                    116,
                    97,
                    116,
                    117,
                    115,
                    10,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    10,
                    77,
                    97,
                    110,
                    117,
                    102,
                    97,
                    99,
                    116,
                    117,
                    114,
                    101,
                    114,
                    58,
                    32,
                    85,
                    110,
                    107,
                    110,
                    111,
                    119,
                    110,
                    32,
                    77,
                    97,
                    110,
                    117,
                    102,
                    97,
                    99,
                    116,
                    117,
                    114,
                    101,
                    114,
                    10,
                    77,
                    111,
                    100,
                    101,
                    108,
                    58,
                    32,
                    32,
                    32,
                    32,
                    32,
                    32,
                    32,
                    32,
                    85,
                    110,
                    107,
                    110,
                    111,
                    119,
                    110,
                    32,
                    77,
                    111,
                    100,
                    101,
                    108,
                    10,
                    83,
                    101,
                    114,
                    105,
                    97,
                    108,
                    58,
                    32,
                    32,
                    32,
                    32,
                    32,
                    32,
                    32,
                    110,
                    111,
                    95,
                    115,
                    101,
                    114,
                    105,
                    97,
                    108,
                    95,
                    110,
                    109,
                    10,
                    70,
                    105,
                    114,
                    109,
                    119,
                    97,
                    114,
                    101,
                    58,
                    32,
                    32,
                    32,
                    32,
                    32,
                    10,
                    67,
                    104,
                    97,
                    114,
                    115,
                    47,
                    108,
                    105,
                    110,
                    101,
                    58,
                    32,
                    32,
                    32,
                    52,
                    50,
                    10,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    45,
                    10,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "PaperSensorStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    1,
                  ],
                },
                Transaction {
                  "awaitedCommands": [
                    CmdTransmitPrinterStatus {
                      "commandLanguageApplicability": 1,
                      "effectFlags": Set {
                        "waitsForResponse",
                      },
                      "name": "Transmit Printer Status",
                      "subcommand": "DrawerKickStatus",
                      "type": "CustomCommand",
                      "typeExtended": Symbol(TransmitPrinterStatus),
                    },
                  ],
                  "commands": Uint8Array [
                    29,
                    114,
                    2,
                  ],
                },
              ],
            }
          `);
      });
    });
  });
});
