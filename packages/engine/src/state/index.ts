/**
 * Connection state machine for an engine session.
 *
 * ```
 *   idle ──► connecting ──► authenticating ──► open
 *     ▲           │              │              │
 *     │           ▼              ▼              ▼
 *     └─── closed ◄── closing ◄──┴─ reconnecting
 * ```
 */

import { ENGINE_ERROR_CODES, EngineError } from '../errors/index.js';

export const CONNECTION_STATES = {
  Idle: 'idle',
  Connecting: 'connecting',
  Authenticating: 'authenticating',
  Open: 'open',
  Closing: 'closing',
  Closed: 'closed',
  Reconnecting: 'reconnecting',
} as const;

export type ConnectionState = (typeof CONNECTION_STATES)[keyof typeof CONNECTION_STATES];

const TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  idle: ['connecting', 'closed'],
  connecting: ['authenticating', 'open', 'closing', 'closed', 'reconnecting'],
  authenticating: ['open', 'closing', 'closed', 'reconnecting'],
  open: ['closing', 'closed', 'reconnecting'],
  closing: ['closed'],
  closed: ['connecting', 'reconnecting'],
  reconnecting: ['connecting', 'closing', 'closed'],
};

export type StateListener = (next: ConnectionState, previous: ConnectionState) => void;

export interface StateMachineSnapshot {
  state: ConnectionState;
  enteredAt: number;
  transitions: number;
}

export class ConnectionStateMachine {
  private _state: ConnectionState;
  private _enteredAt: number;
  private _transitions = 0;
  private readonly listeners = new Set<StateListener>();
  private readonly waiters = new Map<ConnectionState, Set<() => void>>();

  constructor(initial: ConnectionState = CONNECTION_STATES.Idle) {
    this._state = initial;
    this._enteredAt = Date.now();
  }

  get state(): ConnectionState {
    return this._state;
  }

  snapshot(): StateMachineSnapshot {
    return {
      state: this._state,
      enteredAt: this._enteredAt,
      transitions: this._transitions,
    };
  }

  /** Returns true if `next` is a valid transition from the current state. */
  canTransitionTo(next: ConnectionState): boolean {
    if (next === this._state) return false;
    return TRANSITIONS[this._state].includes(next);
  }

  /**
   * Transition to `next`. Throws EngineError(STATE_INVALID_TRANSITION) for illegal moves.
   * Notifies all listeners synchronously; resolves any `waitFor(next)` promises.
   */
  transition(next: ConnectionState): void {
    if (!this.canTransitionTo(next)) {
      throw new EngineError({
        code: ENGINE_ERROR_CODES.STATE_INVALID_TRANSITION,
        message: `Invalid transition: ${this._state} → ${next}`,
        details: { from: this._state, to: next },
      });
    }
    const previous = this._state;
    this._state = next;
    this._enteredAt = Date.now();
    this._transitions += 1;
    for (const listener of this.listeners) {
      listener(next, previous);
    }
    const waiters = this.waiters.get(next);
    if (waiters) {
      this.waiters.delete(next);
      for (const resolve of waiters) {
        resolve();
      }
    }
  }

  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Resolves when the machine enters `target`. Resolves immediately if already there.
   * If `timeoutMs` is given, rejects with EngineError(CONNECTION_TIMEOUT) on timeout.
   */
  waitFor(target: ConnectionState, timeoutMs?: number): Promise<void> {
    if (this._state === target) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const bucket = this.waiters.get(target) ?? new Set();
      bucket.add(resolve);
      this.waiters.set(target, bucket);
      if (timeoutMs !== undefined) {
        const timer = setTimeout(() => {
          bucket.delete(resolve);
          reject(
            new EngineError({
              code: ENGINE_ERROR_CODES.CONNECTION_TIMEOUT,
              message: `Timed out after ${timeoutMs}ms waiting for state '${target}'`,
              retryable: true,
              details: { target, currentState: this._state, timeoutMs },
            }),
          );
        }, timeoutMs);
        // Wrap resolve to clear timer
        bucket.delete(resolve);
        const wrapped = () => {
          clearTimeout(timer);
          resolve();
        };
        bucket.add(wrapped);
      }
    });
  }
}
