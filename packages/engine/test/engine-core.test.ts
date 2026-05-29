import { describe, expect, it } from 'bun:test';

import {
  CONNECTION_STATES,
  ConnectionStateMachine,
  ENGINE_ERROR_CODES,
  EngineError,
  EngineEventBus,
  computeBackoffMs,
  DEFAULT_RECONNECTION,
  isEngineError,
  resolveReconnection,
} from '../src/index.js';

describe('ConnectionStateMachine', () => {
  it('starts in idle by default', () => {
    const fsm = new ConnectionStateMachine();
    expect(fsm.state).toBe(CONNECTION_STATES.Idle);
    expect(fsm.snapshot().transitions).toBe(0);
  });

  it('transitions through the happy path', () => {
    const fsm = new ConnectionStateMachine();
    fsm.transition(CONNECTION_STATES.Connecting);
    fsm.transition(CONNECTION_STATES.Authenticating);
    fsm.transition(CONNECTION_STATES.Open);
    expect(fsm.state).toBe(CONNECTION_STATES.Open);
    expect(fsm.snapshot().transitions).toBe(3);
  });

  it('rejects invalid transitions', () => {
    const fsm = new ConnectionStateMachine();
    expect(() => fsm.transition(CONNECTION_STATES.Open)).toThrow(EngineError);
    try {
      fsm.transition(CONNECTION_STATES.Open);
    } catch (err) {
      expect(isEngineError(err)).toBe(true);
      expect((err as EngineError).code).toBe(ENGINE_ERROR_CODES.STATE_INVALID_TRANSITION);
    }
  });

  it('canTransitionTo returns false for the current state', () => {
    const fsm = new ConnectionStateMachine();
    expect(fsm.canTransitionTo(CONNECTION_STATES.Idle)).toBe(false);
    expect(fsm.canTransitionTo(CONNECTION_STATES.Connecting)).toBe(true);
  });

  it('notifies listeners on transition', () => {
    const fsm = new ConnectionStateMachine();
    const events: string[] = [];
    fsm.onChange((next, prev) => events.push(`${prev}->${next}`));
    fsm.transition(CONNECTION_STATES.Connecting);
    fsm.transition(CONNECTION_STATES.Authenticating);
    expect(events).toEqual(['idle->connecting', 'connecting->authenticating']);
  });

  it('listener can unsubscribe', () => {
    const fsm = new ConnectionStateMachine();
    let count = 0;
    const off = fsm.onChange(() => {
      count += 1;
    });
    fsm.transition(CONNECTION_STATES.Connecting);
    off();
    fsm.transition(CONNECTION_STATES.Authenticating);
    expect(count).toBe(1);
  });

  it('waitFor resolves immediately when already in target state', async () => {
    const fsm = new ConnectionStateMachine();
    await expect(fsm.waitFor(CONNECTION_STATES.Idle)).resolves.toBeUndefined();
  });

  it('waitFor resolves when target is reached', async () => {
    const fsm = new ConnectionStateMachine();
    const p = fsm.waitFor(CONNECTION_STATES.Open);
    fsm.transition(CONNECTION_STATES.Connecting);
    fsm.transition(CONNECTION_STATES.Open);
    await expect(p).resolves.toBeUndefined();
  });

  it('waitFor times out with CONNECTION_TIMEOUT', async () => {
    const fsm = new ConnectionStateMachine();
    await expect(fsm.waitFor(CONNECTION_STATES.Open, 10)).rejects.toMatchObject({
      code: ENGINE_ERROR_CODES.CONNECTION_TIMEOUT,
    });
  });
});

describe('computeBackoffMs', () => {
  it('grows exponentially up to the cap', () => {
    const cfg = { ...DEFAULT_RECONNECTION, jitter: 0 };
    expect(computeBackoffMs(1, cfg)).toBe(1_000);
    expect(computeBackoffMs(2, cfg)).toBe(2_000);
    expect(computeBackoffMs(3, cfg)).toBe(4_000);
    expect(computeBackoffMs(10, cfg)).toBe(cfg.maxDelayMs);
  });

  it('applies jitter within tolerance', () => {
    const cfg = { ...DEFAULT_RECONNECTION, jitter: 0.5 };
    for (let i = 0; i < 50; i += 1) {
      const delay = computeBackoffMs(3, cfg);
      // base = 4000, jitter range = 4000 * 0.5 = 2000, ±1000 around 4000
      expect(delay).toBeGreaterThanOrEqual(3_000);
      expect(delay).toBeLessThanOrEqual(5_000);
    }
  });
});

describe('resolveReconnection', () => {
  it('returns defaults when input is undefined', () => {
    expect(resolveReconnection(undefined)).toEqual(DEFAULT_RECONNECTION);
  });

  it('merges partial overrides', () => {
    expect(resolveReconnection({ maxAttempts: 3 })).toEqual({
      ...DEFAULT_RECONNECTION,
      maxAttempts: 3,
    });
  });
});

describe('EngineEventBus', () => {
  it('routes typed events to typed handlers only', () => {
    const bus = new EngineEventBus();
    const qrEvents: string[] = [];
    const stateEvents: string[] = [];
    bus.on('auth.qr', (e) => qrEvents.push(e.qr));
    bus.on('connection.state', (e) => stateEvents.push(e.state));

    bus.emit({ type: 'auth.qr', qr: 'q1', expiresAt: 1 });
    bus.emit({ type: 'connection.state', state: 'open', previous: 'authenticating' });

    expect(qrEvents).toEqual(['q1']);
    expect(stateEvents).toEqual(['open']);
  });

  it('onAny receives every event', () => {
    const bus = new EngineEventBus();
    const seen: string[] = [];
    bus.onAny((e) => seen.push(e.type));
    bus.emit({ type: 'auth.qr', qr: 'q', expiresAt: 0 });
    bus.emit({ type: 'connection.state', state: 'open', previous: 'idle' });
    expect(seen).toEqual(['auth.qr', 'connection.state']);
  });

  it('off removes a handler', () => {
    const bus = new EngineEventBus();
    let count = 0;
    const handler = () => {
      count += 1;
    };
    bus.on('auth.qr', handler);
    bus.emit({ type: 'auth.qr', qr: 'a', expiresAt: 0 });
    bus.off('auth.qr', handler);
    bus.emit({ type: 'auth.qr', qr: 'b', expiresAt: 0 });
    expect(count).toBe(1);
  });

  it('throwing handler does not break sibling handlers', () => {
    const bus = new EngineEventBus();
    let secondCalled = false;
    bus.on('auth.qr', () => {
      throw new Error('boom');
    });
    bus.on('auth.qr', () => {
      secondCalled = true;
    });
    const results = bus.emit({ type: 'auth.qr', qr: 'q', expiresAt: 0 });
    expect(secondCalled).toBe(true);
    expect(results.length).toBe(0);
  });
});

describe('EngineError', () => {
  it('preserves code, message, retryable, details', () => {
    const err = new EngineError({
      code: ENGINE_ERROR_CODES.CONNECTION_FAILED,
      message: 'boom',
      retryable: true,
      details: { attempt: 3 },
    });
    expect(err.code).toBe(ENGINE_ERROR_CODES.CONNECTION_FAILED);
    expect(err.retryable).toBe(true);
    expect(err.details).toEqual({ attempt: 3 });
    expect(err.message).toBe('boom');
    expect(isEngineError(err)).toBe(true);
  });

  it('isEngineError discriminates from plain Errors', () => {
    expect(isEngineError(new Error('x'))).toBe(false);
    expect(isEngineError(null)).toBe(false);
  });
});
