import * as Conf from '../Configs/index.js';
import * as Commands from './Commands.js';
import { TranspileDocumentError, type TranspiledDocumentState } from "./TranspileCommand.js";
import { ErrorState, ErrorStateSet, MessageParsingError, RawMessageTransformer, StringMessageTransformer, type CommandSetMessageHandlerDelegate, type IMessageHandlerResult, type MessageTransformer } from './Messages.js';
import type { PrinterConfig } from './PrinterConfig.js';

/** How a command should be wrapped into a form, if at all */
export enum CommandFormInclusionMode {
  /** Command can appear in a shared form with other commands. */
  sharedForm = 0,
  /** Command should not be wrapped in a form at all. */
  noForm
}

/** Describes a class capable of managing command implementations. */
export interface CommandSet<TMsgType extends Conf.MessageArrayLike> {

  /** Handle the dispatch of a message received from the printer. */
  handleMessage<TReceived extends Conf.MessageArrayLike>(
    msg: TReceived,
    config: PrinterConfig,
    sentCommand?: Commands.IPrinterCommand
  ): IMessageHandlerResult<TReceived>;

  /** Gets the command language this command set implements */
  get commandLanguage(): Conf.PrinterCommandLanguage;

  /** Gets the prefix to start a new document. */
  get documentStartPrefix(): TMsgType;
  /** Gets the suffix to end a document. */
  get documentEndSuffix(): TMsgType;

  /** Get expanded commands for a given command, if applicable. */
  expandCommand(cmd: Commands.IPrinterCommand): Commands.IPrinterCommand[];
  /** Determine if a given command must appear outside of a form. */
  isCommandNonFormCommand(cmd: Commands.IPrinterCommand): boolean;
  /** Combine separate commands into one. */
  combineCommands(...commands: TMsgType[]): TMsgType;
  /** Dispatch a message to the appropriate handler for it. */
  callMessageHandler(
    message: TMsgType,
    sentCommand?: Commands.IPrinterCommand
  ): IMessageHandlerResult<TMsgType>

  /** Expand a printer config to a language-specific config. */
  getConfig(config: PrinterConfig): PrinterConfig;

  /** Transpile a single command, tracking its effects to a document. */
  transpileCommand(
    cmd: Commands.IPrinterCommand,
    docMetadata: TranspiledDocumentState
  ): TMsgType | TranspileDocumentError;
}

/** A method for transpiling a given command to its native command. */
export type TranspileCommandDelegate<
  TCmd extends Commands.IPrinterCommand,
  TMsgType extends Conf.MessageArrayLike
> = (
  cmd: TCmd,
  docState: TranspiledDocumentState,
  commandSet: CommandSet<TMsgType>
) => TMsgType | TranspileDocumentError;

/** A method for expanding one command into multiple other commands. */
export type CommandExpandDelegate<TCmd extends Commands.IPrinterCommand> = (
  cmd?: TCmd
) => Commands.IPrinterCommand[];

/** A method for handling a response message to a command. */
export type MessageHandlerDelegate<TMsgType> = (
  msg: TMsgType,
  sentCommand: Commands.IPrinterCommand
) => IMessageHandlerResult<TMsgType>;

/** A manifest for a printer command's behavior. */
export interface IPrinterCommandMapping<TMsgType extends Conf.MessageArrayLike> {
  /** The printer command being mapped. */
  commandType: Commands.CommandAnyType,
  /** Method to transpile this command to its native command. */
  transpile?: TranspileCommandDelegate<Commands.IPrinterCommand, TMsgType>,
  /** Method to replace a command with multiple other commands. */
  expand?: CommandExpandDelegate<Commands.IPrinterCommand>,
  /** Method to handle a message from the device in response to this command. */
  readMessage?: MessageHandlerDelegate<TMsgType>,
  /** Compatibility of this command with being included in a form. Defaults to true. */
  formInclusionMode?: CommandFormInclusionMode,
}

export abstract class PrinterCommandSet<TMsgType extends Conf.MessageArrayLike> implements CommandSet<TMsgType> {
  private cmdLanguage: Conf.PrinterCommandLanguage;
  get commandLanguage() {
    return this.cmdLanguage;
  }

  protected abstract get noop(): TMsgType;

  protected messageTransformer: MessageTransformer<TMsgType>;

  protected messageHandlerDelegate: CommandSetMessageHandlerDelegate<TMsgType>;

  protected commandMap = new Map<Commands.CommandAnyType, IPrinterCommandMapping<TMsgType>>;

  protected constructor(
    transformer           : MessageTransformer<TMsgType>,
    messageHandlerDelegate: CommandSetMessageHandlerDelegate<TMsgType>,
    implementedLanguage   : Conf.PrinterCommandLanguage,
    basicCommands         : Record<Commands.CommandType,                IPrinterCommandMapping<TMsgType>>,
    extendedCommands      : IPrinterCommandMapping<TMsgType>[] = [],
  ) {
    this.cmdLanguage = implementedLanguage;
    this.messageTransformer = transformer;
    this.messageHandlerDelegate = messageHandlerDelegate;
    for (const cmdType of Commands.basicCommandTypes) {
      this.commandMap.set(cmdType, basicCommands[cmdType]);
    }
    // Support overriding behaviors
    extendedCommands.forEach(c => this.commandMap.set(c.commandType, c));
  }

  abstract get documentStartPrefix(): TMsgType;
  abstract get documentEndSuffix(): TMsgType;

  public transpileCommand(
    cmd: Commands.IPrinterCommand,
    docMetadata: TranspiledDocumentState
  ): TMsgType | TranspileDocumentError{
    const mappedCmd = this.getMappedCmd(cmd);
    if (mappedCmd === undefined) {
      return new TranspileDocumentError(`Command could not be mapped, is the command mapping correcT?`);
    }
    const handler = mappedCmd.transpile ?? (() => this.noop);
    return handler(cmd, docMetadata, this);
  }

  public handleMessage<TReceived extends Conf.MessageArrayLike>(
    msg: TReceived,
    config: PrinterConfig,
    sentCommand?: Commands.IPrinterCommand,
  ): IMessageHandlerResult<TReceived> {
    return this.messageHandlerDelegate(
      this,
      msg,
      config,
      sentCommand
    );
  }

  protected getMappedCmd(cmd: Commands.IPrinterCommand) {
    return this.commandMap.get(Commands.getCommandAnyType(cmd));
  }

  public isCommandNonFormCommand(cmd: Commands.IPrinterCommand): boolean {
    return this.getMappedCmd(cmd)?.formInclusionMode === CommandFormInclusionMode.noForm;
  }

  public expandCommand(cmd: Commands.IPrinterCommand): Commands.IPrinterCommand[] {
    return (this.getMappedCmd(cmd)?.expand ?? (() => []))(cmd);
  }

  public combineCommands(...commands: TMsgType[]) {
    return this.messageTransformer.combineMessages(...commands);
  }

  public getConfig(config: PrinterConfig): PrinterConfig {
    return config;
  }

  /**
   * Dispatch a received message to the handler for the command that asked for it.
   *
   * This must NEVER throw. It runs on the input listener's read loop, and an
   * exception there rejects the listener's promise, which permanently stops the
   * loop while the channel stays open and `connected` keeps reporting true.
   * The printer then looks healthy but every subsequent operation waits out its
   * full timeout, forever. Unparseable input is reported as an ErrorMessage and
   * left for the caller to resynchronise instead.
   */
  public callMessageHandler(
    message: TMsgType,
    sentCommand?: Commands.IPrinterCommand
  ): IMessageHandlerResult<TMsgType> {
    const unhandled = (reason: string): IMessageHandlerResult<TMsgType> => ({
      messageIncomplete: false,
      messageMatchedExpectedCommand: false,
      messages: [{
        messageType: 'ErrorMessage',
        errors: new ErrorStateSet([ErrorState.MessageReceiveException]),
        exceptions: [new MessageParsingError(reason, message)],
      }],
      remainder: message,
    });

    if (sentCommand === undefined) {
      // Not an error in itself: the printer is free to send unsolicited data,
      // and a reply can legitimately arrive after its command already timed out.
      return unhandled(
        `Received a command reply message without 'sentCommand' being provided, can't handle this message.`
      );
    }

    const handler = this.getMappedCmd(sentCommand)?.readMessage;
    if (handler === undefined) {
      return unhandled(
        `Command '${sentCommand.name}' has no message handler and should not have been awaited for this message. This is a bug in the library.`
      );
    }

    try {
      return handler(message, sentCommand);
    } catch (e) {
      return unhandled(
        `Message handler for command '${sentCommand.name}' threw: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  protected getExtendedCommand(
    cmd: Commands.IPrinterCommand
  ) {
    const lookup = (cmd as Commands.IPrinterExtendedCommand).typeExtended;
    if (!lookup) {
      throw new TranspileDocumentError(
        `Command '${cmd.constructor.name}' did not have a value for typeExtended. If you're trying to implement a custom command check the documentation.`
      )
    }

    const handler = this.getMappedCmd(cmd)?.transpile;

    if (handler === undefined) {
      throw new TranspileDocumentError(
        `Unknown command '${cmd.constructor.name}' was not found in the command map for ${this.commandLanguage} command language. If you're trying to implement a custom command check the documentation for correctly adding mappings.`
      );
    }
    return handler;
  }
}

export abstract class RawCommandSet extends PrinterCommandSet<Uint8Array> {

  protected static readonly _noop = new Uint8Array();
  public get noop() {
    return RawCommandSet._noop;
  }

  protected constructor(
    implementedLanguage   : Conf.PrinterCommandLanguage,
    messageHandlerDelegate: CommandSetMessageHandlerDelegate<Uint8Array>,
    basicCommands         : Record<Commands.CommandType, IPrinterCommandMapping<Uint8Array>>,
    extendedCommands      : IPrinterCommandMapping<Uint8Array>[] = []
  ) {
    super(
      new RawMessageTransformer(),
      messageHandlerDelegate,
      implementedLanguage,
      basicCommands,
      extendedCommands
    );
  }
}

export abstract class StringCommandSet extends PrinterCommandSet<string> {

  protected static readonly _noop = "";
  public get noop() {
    return StringCommandSet._noop;
  }

  protected constructor(
    implementedLanguage   : Conf.PrinterCommandLanguage,
    messageHandlerDelegate: CommandSetMessageHandlerDelegate<string>,
    basicCommands         : Record<Commands.CommandType, IPrinterCommandMapping<string>>,
    extendedCommands      : IPrinterCommandMapping<string>[] = []
  ) {
    super(
      new StringMessageTransformer(),
      messageHandlerDelegate,
      implementedLanguage,
      basicCommands,
      extendedCommands
    );
  }
}
