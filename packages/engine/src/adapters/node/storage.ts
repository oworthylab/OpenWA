/**
 * Filesystem-backed {@link IStorage}. One JSON file per key, namespaced into a
 * directory. Designed for local development and the Sprint 5 desktop app.
 * NOT used in Workers (which uses `DOStorage`).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { IStorage } from '../../storage/index.js';

function encode(key: string): string {
  // Make the key safe to use as a filename — Baileys uses keys like
  // `session-12345.abc=` which contain `=`/`/` characters.
  return Buffer.from(key, 'utf8').toString('base64url');
}

function decode(file: string): string {
  return Buffer.from(file, 'base64url').toString('utf8');
}

export class NodeFsStorage implements IStorage {
  private ensured = false;

  constructor(private readonly dir: string) {}

  private async ensureDir(): Promise<void> {
    if (this.ensured) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.ensured = true;
  }

  private filePath(key: string): string {
    return path.join(this.dir, `${encode(key)}.json`);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.filePath(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.filePath(key), JSON.stringify(value), 'utf8');
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const decoded = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => decode(f.slice(0, -'.json'.length)));
    return prefix === undefined ? decoded : decoded.filter((k) => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.dir, { recursive: true, force: true });
      this.ensured = false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
