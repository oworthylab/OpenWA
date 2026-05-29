/**
 * Public engine contract. Adapters implement this interface; consumers (the
 * API Worker, integration tests, and the Sprint 4 dashboard) program against
 * it exclusively so we can swap Node ⇄ Cloudflare runtimes without churn.
 */

import type { AuthState } from './auth/index.js';
import type { EngineEvent, EngineEventHandler, EngineEventType } from './events/index.js';
import type { SendMediaInput, SendResult, SendTextInput } from './messages.js';
import type { ConnectionState, StateMachineSnapshot } from './state/index.js';

export interface EngineHealth {
  state: ConnectionState;
  authenticated: boolean;
  lastError?: string;
  uptimeMs: number;
}

/**
 * The vendor-neutral engine façade. Methods that touch the network return
 * `Promise`s and may throw {@link EngineError}.
 */
export interface IEngine {
  readonly sessionId: string;
  readonly state: ConnectionState;

  /** Open the connection, perform auth if needed, and resolve when state === 'open'. */
  connect(): Promise<void>;
  /** Gracefully close the connection. Resolves when state === 'closed'. */
  disconnect(): Promise<void>;
  /** Permanently clear credentials and disconnect. */
  logout(): Promise<void>;

  getAuthState(): Promise<AuthState>;
  getHealth(): EngineHealth;
  getStateSnapshot(): StateMachineSnapshot;

  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;

  on<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>): () => void;
  off<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>): void;
  /** Fan-in subscription receiving every event. */
  onAny(handler: (event: EngineEvent) => void | Promise<void>): () => void;
}
