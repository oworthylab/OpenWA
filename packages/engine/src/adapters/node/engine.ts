/**
 * Node.js adapter — wraps {@link https://github.com/WhiskeySockets/Baileys Baileys}
 * to implement {@link IEngine}.
 *
 * **Why Baileys?** The sprint plan calls for "Fork Baileys integration"
 * (US-007 task #7). Re-implementing the Noise_XX + Signal Protocol stack
 * from scratch is ~3 dev-weeks per the original plan and a security risk
 * during the migration. Baileys is the de-facto reference TS implementation
 * and is already used widely in production. We isolate it behind the
 * {@link IEngine} façade so a future pure-JS replacement (Sprint 9+) can be
 * dropped in without touching the API or dashboard layers.
 *
 * **Runtime scope:** This adapter runs in Bun and Node.js. It does NOT run
 * in Cloudflare Workers — Baileys depends on the `ws` package and
 * `node:crypto`. The Cloudflare DO adapter is a separate implementation
 * that talks to WhatsApp via native `WebSocket` + Web Crypto (Sprint 2b/3).
 */

import {
  type AnyMessageContent,
  type ConnectionState as BaileysConnectionState,
  Browsers,
  DisconnectReason,
  type WASocket,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { type Logger, pino } from 'pino';

import type { AuthState } from '../../auth/index.js';
import { computeBackoffMs, resolveReconnection } from '../../config.js';
import type { EngineConfig, ReconnectionConfig } from '../../config.js';
import type { EngineHealth, IEngine } from '../../engine.js';
import { ENGINE_ERROR_CODES, EngineError } from '../../errors/index.js';
import { EngineEventBus } from '../../event-bus.js';
import type { EngineEvent, EngineEventHandler, EngineEventType } from '../../events/index.js';
import type { SendMediaInput, SendResult, SendTextInput } from '../../messages.js';
import { CONNECTION_STATES, ConnectionStateMachine } from '../../state/index.js';

export interface NodeEngineOptions {
  /** Engine configuration. */
  config: EngineConfig;
  /** Directory used to persist Baileys auth state (creds + signal keys). */
  authDir: string;
  /** Optional injected logger. Defaults to a pino logger at `config.logLevel`. */
  logger?: Logger;
}

export class NodeEngine implements IEngine {
  readonly sessionId: string;
  private readonly bus = new EngineEventBus();
  private readonly fsm = new ConnectionStateMachine();
  private readonly logger: Logger;
  private readonly reconnection: ReconnectionConfig;
  private readonly authDir: string;
  private readonly authStrategy: EngineConfig['auth'];

  private sock: WASocket | null = null;
  private saveCreds: (() => Promise<void>) | null = null;
  private authState: AuthState = { isAuthenticated: false };
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastError: string | undefined;
  private startedAt = Date.now();
  private pendingDisconnect = false;
  /** Resolves on the next `open` transition (used by `connect()` to await readiness). */
  private openWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

  constructor(opts: NodeEngineOptions) {
    this.sessionId = opts.config.sessionId;
    this.authDir = opts.authDir;
    this.authStrategy = opts.config.auth;
    this.reconnection = resolveReconnection(opts.config.reconnection);
    this.logger = opts.logger ?? pino({ level: opts.config.logLevel ?? 'info' });
  }

  get state() {
    return this.fsm.state;
  }

  getHealth(): EngineHealth {
    const health: EngineHealth = {
      state: this.fsm.state,
      authenticated: this.authState.isAuthenticated,
      uptimeMs: Date.now() - this.startedAt,
    };
    if (this.lastError !== undefined) health.lastError = this.lastError;
    return health;
  }

  getStateSnapshot() {
    return this.fsm.snapshot();
  }

  async getAuthState(): Promise<AuthState> {
    return { ...this.authState };
  }

  async connect(): Promise<void> {
    if (this.fsm.state === CONNECTION_STATES.Open) return;
    this.pendingDisconnect = false;
    await this.openConnection();
    await new Promise<void>((resolve, reject) => {
      this.openWaiter = { resolve, reject };
    });
  }

  async disconnect(): Promise<void> {
    this.pendingDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // Falls through — we still want to close locally.
      }
      try {
        this.sock.end(undefined);
      } catch {
        /* noop */
      }
      this.sock = null;
    }
    this.transitionSafe(CONNECTION_STATES.Closing);
    this.transitionSafe(CONNECTION_STATES.Closed);
  }

  async logout(): Promise<void> {
    await this.disconnect();
    // Wipe persisted creds so the next connect requires fresh auth.
    const { promises: fs } = await import('node:fs');
    await fs.rm(this.authDir, { recursive: true, force: true });
    this.authState = { isAuthenticated: false };
  }

  on<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>) {
    return this.bus.on(type, handler);
  }

  off<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>) {
    this.bus.off(type, handler);
  }

  onAny(handler: (event: EngineEvent) => void | Promise<void>) {
    return this.bus.onAny(handler);
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const sock = this.requireOpenSocket();
    const result = await sock.sendMessage(input.to, { text: input.text });
    return {
      id: result?.key?.id ?? '',
      to: input.to,
      timestamp:
        typeof result?.messageTimestamp === 'number' ? result.messageTimestamp * 1000 : Date.now(),
    };
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    const sock = this.requireOpenSocket();
    const payload = this.buildMediaPayload(input);
    const result = await sock.sendMessage(input.to, payload);
    return {
      id: result?.key?.id ?? '',
      to: input.to,
      timestamp:
        typeof result?.messageTimestamp === 'number' ? result.messageTimestamp * 1000 : Date.now(),
    };
  }

  // --- internals ----------------------------------------------------------

  private requireOpenSocket(): WASocket {
    if (!this.sock || this.fsm.state !== CONNECTION_STATES.Open) {
      throw new EngineError({
        code: ENGINE_ERROR_CODES.AUTH_NOT_READY,
        message: `Engine not open (state: ${this.fsm.state})`,
      });
    }
    return this.sock;
  }

  private buildMediaPayload(input: SendMediaInput): AnyMessageContent {
    const source = input.url
      ? { url: input.url }
      : { stream: Buffer.from(input.base64 ?? '', 'base64') };
    const common: Record<string, unknown> = {};
    if (input.caption !== undefined) common.caption = input.caption;
    if (input.mimeType !== undefined) common.mimetype = input.mimeType;
    switch (input.kind) {
      case 'image':
        return { image: source, ...common } as AnyMessageContent;
      case 'video':
        return { video: source, ...common } as AnyMessageContent;
      case 'audio':
        return { audio: source, ptt: input.ptt ?? false, ...common } as AnyMessageContent;
      case 'document':
        return {
          document: source,
          fileName: input.filename ?? 'document',
          ...common,
        } as AnyMessageContent;
      case 'sticker':
        return { sticker: source } as AnyMessageContent;
      default: {
        const _exhaustive: never = input.kind;
        throw new EngineError({
          code: ENGINE_ERROR_CODES.SEND_FAILED,
          message: `Unsupported media kind: ${String(_exhaustive)}`,
        });
      }
    }
  }

  private transitionSafe(target: Parameters<ConnectionStateMachine['transition']>[0]): void {
    if (this.fsm.canTransitionTo(target)) {
      this.fsm.transition(target);
      this.bus.emit({ type: 'connection.state', state: target, previous: this.fsm.state });
    }
  }

  private async openConnection(): Promise<void> {
    this.transitionSafe(CONNECTION_STATES.Connecting);
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    this.saveCreds = saveCreds;
    this.authState = {
      isAuthenticated: Boolean(state.creds?.me?.id),
      ...(state.creds?.me?.id ? { jid: state.creds.me.id } : {}),
      ...(state.creds?.me?.name ? { pushName: state.creds.me.name } : {}),
    };

    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: undefined as [number, number, number] | undefined,
    }));

    this.sock = makeWASocket({
      auth: state,
      logger: this.logger as unknown as Logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      ...(version ? { version } : {}),
    });

    this.sock.ev.on('creds.update', () => {
      void this.saveCreds?.();
    });

    this.sock.ev.on('connection.update', (update: Partial<BaileysConnectionState>) => {
      this.handleConnectionUpdate(update);
    });

    this.sock.ev.on('messages.upsert', ({ messages }) => {
      for (const m of messages) {
        if (!m.key.id) continue;
        const event: EngineEvent = {
          type: 'message.received',
          payload: m,
          normalised: {
            id: m.key.id,
            from: m.key.remoteJid ?? '',
            timestamp:
              typeof m.messageTimestamp === 'number' ? m.messageTimestamp * 1000 : Date.now(),
            fromMe: Boolean(m.key.fromMe),
          },
        };
        this.bus.emit(event);
      }
    });

    // Pairing-code flow: if requested AND we have no creds yet, ask the
    // server for an 8-digit code.
    if (this.authStrategy.type === 'pairing-code' && !this.sock.authState.creds.registered) {
      try {
        const code = await this.sock.requestPairingCode(this.authStrategy.phoneNumber);
        this.bus.emit({
          type: 'auth.pairing_code',
          code,
          expiresAt: Date.now() + 60_000,
        });
      } catch (err) {
        this.bus.emit({
          type: 'connection.error',
          error: new EngineError({
            code: ENGINE_ERROR_CODES.AUTH_FAILED,
            message: 'Failed to request pairing code',
            cause: err,
          }),
        });
      }
    }
  }

  private handleConnectionUpdate(update: Partial<BaileysConnectionState>): void {
    if (update.qr) {
      this.bus.emit({
        type: 'auth.qr',
        qr: update.qr,
        expiresAt: Date.now() + 20_000,
      });
      this.transitionSafe(CONNECTION_STATES.Authenticating);
    }
    if (update.connection === 'open') {
      this.reconnectAttempts = 0;
      this.lastError = undefined;
      this.authState = {
        isAuthenticated: true,
        ...(this.sock?.user?.id ? { jid: this.sock.user.id } : {}),
        ...(this.sock?.user?.name ? { pushName: this.sock.user.name } : {}),
      };
      this.transitionSafe(CONNECTION_STATES.Open);
      this.bus.emit({
        type: 'auth.ready',
        jid: this.authState.jid ?? '',
        ...(this.authState.pushName ? { pushName: this.authState.pushName } : {}),
      });
      this.openWaiter?.resolve();
      this.openWaiter = null;
    }
    if (update.connection === 'close') {
      // Baileys throws `@hapi/boom` errors; we only need the statusCode shape.
      const boom = update.lastDisconnect?.error as
        | { output?: { statusCode?: number }; message?: string }
        | undefined;
      const statusCode = boom?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        this.lastError = 'logged_out';
        this.authState = { isAuthenticated: false };
        this.bus.emit({
          type: 'auth.logged_out',
          reason: boom?.message ?? 'logged_out',
        });
        this.transitionSafe(CONNECTION_STATES.Closed);
        this.openWaiter?.reject(
          new EngineError({
            code: ENGINE_ERROR_CODES.AUTH_LOGGED_OUT,
            message: 'Session was logged out by WhatsApp',
          }),
        );
        this.openWaiter = null;
        return;
      }

      this.lastError = boom?.message ?? 'connection_closed';
      this.transitionSafe(CONNECTION_STATES.Closed);
      if (!this.pendingDisconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.reconnection.maxAttempts) {
      const err = new EngineError({
        code: ENGINE_ERROR_CODES.CONNECTION_FAILED,
        message: `Giving up after ${this.reconnection.maxAttempts} reconnect attempts`,
        retryable: false,
      });
      this.bus.emit({ type: 'connection.error', error: err });
      this.openWaiter?.reject(err);
      this.openWaiter = null;
      return;
    }
    const delay = computeBackoffMs(this.reconnectAttempts, this.reconnection);
    this.logger.info(
      { attempt: this.reconnectAttempts, delay, sessionId: this.sessionId },
      'engine.reconnect.scheduled',
    );
    this.transitionSafe(CONNECTION_STATES.Reconnecting);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openConnection().catch((err) => {
        this.logger.error({ err }, 'engine.reconnect.failed');
      });
    }, delay);
  }
}
