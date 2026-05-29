/**
 * Bridge config — zero-config by default.
 *
 * If `BRIDGE_TOKEN` / `BRIDGE_WEBHOOK_SECRET` are not provided, we generate
 * stable random values once and persist them to `${authDir}/.bridge-config.json`.
 * That file is the operator's "config" — back it up and the bridge is fully
 * portable. This way `bun run bridge` Just Works without ceremony.
 *
 * On first start the bridge prints the generated `BRIDGE_TOKEN` and
 * `BRIDGE_WEBHOOK_SECRET` once so the operator can paste them into
 * `wrangler secret put` for the engine + API workers.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BridgeConfig {
  host: string;
  port: number;
  authDir: string;
  bridgeToken: string;
  webhookUrl: string | null;
  webhookSecret: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** True when secrets were generated on this start (caller prints them). */
  generated: { bridgeToken: boolean; webhookSecret: boolean };
}

const port = Number(process.env.BRIDGE_PORT ?? 3001);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid BRIDGE_PORT: ${process.env.BRIDGE_PORT}`);
}

const authDir = process.env.BRIDGE_AUTH_DIR ?? './.wa-auth';
mkdirSync(authDir, { recursive: true });

const cfgPath = join(authDir, '.bridge-config.json');
let persisted: { bridgeToken?: string; webhookSecret?: string } = {};
if (existsSync(cfgPath)) {
  try {
    persisted = JSON.parse(readFileSync(cfgPath, 'utf8'));
  } catch {
    /* corrupted — regenerate */
  }
}

const envToken = process.env.BRIDGE_TOKEN;
const envSecret = process.env.BRIDGE_WEBHOOK_SECRET;

const generatedToken = !envToken && !persisted.bridgeToken;
const generatedSecret = !envSecret && !persisted.webhookSecret;

const bridgeToken = envToken ?? persisted.bridgeToken ?? randomBytes(32).toString('hex');
const webhookSecret =
  envSecret ?? persisted.webhookSecret ?? randomBytes(32).toString('hex');

if (persisted.bridgeToken !== bridgeToken || persisted.webhookSecret !== webhookSecret) {
  writeFileSync(cfgPath, JSON.stringify({ bridgeToken, webhookSecret }, null, 2), {
    mode: 0o600,
  });
}

export const config: BridgeConfig = {
  host: process.env.BRIDGE_HOST ?? '0.0.0.0',
  port,
  authDir,
  bridgeToken,
  webhookUrl: process.env.BRIDGE_WEBHOOK_URL ?? null,
  webhookSecret,
  logLevel: (process.env.LOG_LEVEL as BridgeConfig['logLevel']) ?? 'info',
  generated: { bridgeToken: generatedToken, webhookSecret: generatedSecret },
};
