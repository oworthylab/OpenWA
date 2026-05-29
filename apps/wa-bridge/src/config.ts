/**
 * Bridge config loaded from environment variables. Centralised so the
 * server entry stays focused on wiring.
 */

const must = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export interface BridgeConfig {
  host: string;
  port: number;
  authDir: string;
  bridgeToken: string;
  webhookUrl: string | null;
  webhookSecret: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

const port = Number(process.env.BRIDGE_PORT ?? 3001);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid BRIDGE_PORT: ${process.env.BRIDGE_PORT}`);
}

export const config: BridgeConfig = {
  host: process.env.BRIDGE_HOST ?? '0.0.0.0',
  port,
  authDir: process.env.BRIDGE_AUTH_DIR ?? './.wa-auth',
  bridgeToken: must('BRIDGE_TOKEN'),
  webhookUrl: process.env.BRIDGE_WEBHOOK_URL ?? null,
  webhookSecret: process.env.BRIDGE_WEBHOOK_SECRET ?? 'dev-secret-change-me',
  logLevel: (process.env.LOG_LEVEL as BridgeConfig['logLevel']) ?? 'info',
};
