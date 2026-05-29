/**
 * Tiny typed event bus shared by all adapters. Pure — no Node or Workers APIs.
 */

import type {
  EngineEvent,
  EngineEventHandler,
  EngineEventOf,
  EngineEventType,
} from './events/index.js';

type AnyHandler = (event: EngineEvent) => void | Promise<void>;

export class EngineEventBus {
  private readonly typed = new Map<EngineEventType, Set<EngineEventHandler>>();
  private readonly all = new Set<AnyHandler>();

  on<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>): () => void {
    const bucket = (this.typed.get(type) ?? new Set()) as Set<EngineEventHandler>;
    bucket.add(handler as unknown as EngineEventHandler);
    this.typed.set(type, bucket);
    return () => this.off(type, handler);
  }

  off<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>): void {
    this.typed.get(type)?.delete(handler as unknown as EngineEventHandler);
  }

  onAny(handler: AnyHandler): () => void {
    this.all.add(handler);
    return () => {
      this.all.delete(handler);
    };
  }

  /**
   * Emit synchronously. Handlers may return promises; the caller is responsible
   * for awaiting `Promise.allSettled(emit(...))` when ordering matters.
   */
  emit<T extends EngineEventType>(event: EngineEventOf<T>): Promise<unknown>[] {
    const promises: Promise<unknown>[] = [];
    const typedBucket = this.typed.get(event.type);
    if (typedBucket) {
      for (const handler of typedBucket) {
        try {
          const result = (handler as unknown as EngineEventHandler<T>)(event);
          if (result instanceof Promise) {
            // Attach a default catch so listener rejections don't crash the host.
            promises.push(result.catch(() => undefined));
          }
        } catch {
          // Sync listener errors are swallowed — they must never crash the engine loop.
        }
      }
    }
    for (const handler of this.all) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result.catch(() => undefined));
        }
      } catch {
        // Sync listener errors are swallowed.
      }
    }
    return promises;
  }
}
