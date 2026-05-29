/**
 * `WhatsAppSessionDO` — Durable Object hosting a single WhatsApp session.
 *
 * Sprint 2 status: the DO lifecycle, storage, alarm-based reconnection, and
 * fetch/RPC surface are wired here. The actual WhatsApp wire protocol inside
 * the DO is deferred to Sprint 2b/3 because Baileys depends on Node's `ws`
 * module which is not compatible with the Workers runtime; the DO adapter
 * will use a thin re-implementation that speaks the same Noise frames over
 * the native `WebSocket` constructor.
 *
 * Until then this DO accepts management commands (`/status`, `/health`,
 * `/connect`, `/disconnect`) and reports its state machine snapshot so the
 * API Worker can already integrate against the engine façade.
 */

import { ENGINE_ERROR_CODES, EngineError } from '../../errors/index.js';
import { CONNECTION_STATES, ConnectionStateMachine } from '../../state/index.js';
import { DOStorage } from './storage.js';

interface Env {
  // Bindings will be injected by `apps/engine/wrangler.toml` in later sprints.
  [key: string]: unknown;
}

const STATE_KEY = 'engine:state';
const ALARM_INTERVAL_MS = 30_000;

export interface PersistedState {
  sessionId?: string;
  desiredOpen: boolean;
  lastError?: string;
  lastTransitionAt: number;
}

export class WhatsAppSessionDO implements DurableObject {
  private readonly storage: DOStorage;
  private readonly fsm = new ConnectionStateMachine();
  private persisted: PersistedState = { desiredOpen: false, lastTransitionAt: Date.now() };
  private hydrated = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.storage = new DOStorage(ctx.storage);
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const persisted = await this.storage.get<PersistedState>(STATE_KEY);
    if (persisted) this.persisted = persisted;
    this.hydrated = true;
  }

  private async persist(): Promise<void> {
    this.persisted.lastTransitionAt = Date.now();
    await this.storage.set(STATE_KEY, this.persisted);
  }

  async fetch(request: Request): Promise<Response> {
    await this.hydrate();
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/status':
        return Response.json({
          state: this.fsm.state,
          persisted: this.persisted,
          snapshot: this.fsm.snapshot(),
        });
      case '/health':
        return Response.json({
          ok: true,
          state: this.fsm.state,
          uptimeMs: Date.now() - this.fsm.snapshot().enteredAt,
        });
      case '/connect':
        this.persisted.desiredOpen = true;
        await this.persist();
        // Schedule an alarm to drive the (future) connection loop.
        await this.ctx.storage.setAlarm(Date.now() + 100);
        return Response.json({ ok: true, state: this.fsm.state });
      case '/disconnect':
        this.persisted.desiredOpen = false;
        await this.persist();
        if (this.fsm.canTransitionTo(CONNECTION_STATES.Closing)) {
          this.fsm.transition(CONNECTION_STATES.Closing);
          this.fsm.transition(CONNECTION_STATES.Closed);
        }
        return Response.json({ ok: true, state: this.fsm.state });
      case '/logout':
        // No live WA connection in the DO yet — record intent and reset.
        this.persisted.desiredOpen = false;
        this.persisted.sessionId = undefined;
        await this.persist();
        if (this.fsm.canTransitionTo(CONNECTION_STATES.Closing)) {
          this.fsm.transition(CONNECTION_STATES.Closing);
          this.fsm.transition(CONNECTION_STATES.Closed);
        }
        return Response.json({ ok: true, state: this.fsm.state });
      case '/qr':
        // The Workers-native WA protocol implementation that emits QR codes
        // lands in Sprint 4. Until then we return `null` so callers can
        // distinguish "engine alive, no QR yet" from "engine missing".
        return Response.json({ qr: null });
      case '/messages/text':
      case '/messages/media':
        return Response.json(
          {
            error: {
              code: ENGINE_ERROR_CODES.NOT_IMPLEMENTED,
              message:
                'Message sending requires the Workers-native WA protocol (Sprint 4). Run the Node adapter for a fully functional engine.',
            },
          },
          { status: 501 },
        );
      default:
        // Contacts (US-024) and groups (US-025) routes are accepted by the
        // engine but require the Workers-native WA protocol to actually
        // return data. Until then we respond with a structured 501 so the
        // API layer can surface a deterministic error.
        if (url.pathname.startsWith('/contacts') || url.pathname.startsWith('/groups')) {
          return Response.json(
            {
              error: {
                code: ENGINE_ERROR_CODES.NOT_IMPLEMENTED,
                message:
                  'Contact/group operations require the Workers-native WA protocol. Run the Node adapter for a fully functional engine.',
              },
            },
            { status: 501 },
          );
        }
        return Response.json(
          {
            error: {
              code: ENGINE_ERROR_CODES.NOT_IMPLEMENTED,
              message: `Unknown DO route: ${url.pathname}`,
            },
          },
          { status: 404 },
        );
    }
  }

  /**
   * Alarm handler — used for reconnect timers and periodic health checks.
   * Sprint 2b will hook this into the real connection loop.
   */
  async alarm(): Promise<void> {
    await this.hydrate();
    try {
      if (this.persisted.desiredOpen && this.fsm.state === CONNECTION_STATES.Idle) {
        // Placeholder for the real connect routine.
        this.fsm.transition(CONNECTION_STATES.Connecting);
      }
      // Reschedule for periodic health-checks until the connection layer lands.
      if (this.persisted.desiredOpen) {
        await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      }
    } catch (err) {
      this.persisted.lastError = err instanceof Error ? err.message : String(err);
      await this.persist();
      throw err instanceof EngineError
        ? err
        : new EngineError({
            code: ENGINE_ERROR_CODES.CONNECTION_FAILED,
            message: 'Alarm handler failed',
            cause: err,
          });
    }
  }
}

export { DOStorage };
