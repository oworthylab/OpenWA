/**
 * Storage abstraction used by the engine to persist auth credentials and
 * session keys. The Node adapter implements this against the filesystem; the
 * Cloudflare adapter implements it against `DurableObjectStorage`.
 */

export interface IStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  /**
   * Best-effort batch write. Implementations may apply atomically (DO) or
   * sequentially (FS) — callers MUST treat as best-effort.
   */
  setMany?(entries: ReadonlyArray<[string, unknown]>): Promise<void>;
  /** Wipe the entire keyspace this storage owns. Used by `logout`. */
  clear(): Promise<void>;
}
