/**
 * Cloudflare Durable Object storage adapter.
 *
 * Backs {@link IStorage} with `DurableObjectStorage`, which is strongly
 * consistent within a single DO instance and survives hibernation.
 */

import type { IStorage } from '../../storage/index.js';

export class DOStorage implements IStorage {
  constructor(private readonly storage: DurableObjectStorage) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.storage.get<T>(key);
    return value === undefined ? null : value;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.storage.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const map = await this.storage.list(prefix === undefined ? {} : { prefix });
    return Array.from(map.keys());
  }

  async setMany(entries: ReadonlyArray<[string, unknown]>): Promise<void> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of entries) obj[k] = v;
    await this.storage.put(obj);
  }

  async clear(): Promise<void> {
    await this.storage.deleteAll();
  }
}
