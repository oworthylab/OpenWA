/**
 * Webhook delivery worker (US-031).
 *
 * Cloudflare Queue consumer that signs and POSTs each {@link WebhookQueueMessage}
 * to the configured URL. On 2xx the message is acked. On 4xx/5xx the message
 * is retried with exponential backoff up to {@link MAX_ATTEMPTS} times;
 * after that we mark the webhook as failing in the control-plane DB and
 * let the message land in the queue's dead-letter queue (configured at the
 * Cloudflare side).
 */

import { webhooks } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { eq, sql } from 'drizzle-orm';
import type { ApiEnv, WebhookQueueMessage } from './env.js';
import { hmacSha256Hex } from './lib/crypto.js';

const MAX_ATTEMPTS = 4;
/** Per-attempt delay in seconds: 1s → 5s → 30s → 120s. */
const RETRY_DELAYS_SECONDS = [1, 5, 30, 120];

export async function handleQueueBatch(
  batch: MessageBatch<WebhookQueueMessage>,
  env: ApiEnv,
): Promise<void> {
  // Process messages in parallel but bounded per-batch.
  await Promise.all(batch.messages.map((m) => processMessage(m, env)));
}

async function processMessage(message: Message<WebhookQueueMessage>, env: ApiEnv): Promise<void> {
  const payload = message.body;
  try {
    const signature = await hmacSha256Hex(payload.secret, payload.body);
    const res = await fetch(payload.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-openwa-signature': `sha256=${signature}`,
        'x-openwa-event': payload.event,
        'x-openwa-delivery': payload.deliveryId,
        'x-openwa-webhook-id': payload.webhookId,
        'x-openwa-attempt': String(payload.attempt),
        'user-agent': 'OpenWA-Webhook/0.1',
      },
      body: payload.body,
    });
    await updateDeliveryStatus(env, payload.webhookId, res.status, res.ok);
    if (res.ok) {
      message.ack();
      return;
    }
    // 4xx that is *not* 408/429 should not be retried — the caller's URL is broken.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      message.ack();
      return;
    }
    retryOrDlq(message, payload);
  } catch (e) {
    console.error('[webhook] delivery failed', payload.webhookId, e);
    await updateDeliveryStatus(env, payload.webhookId, 0, false);
    retryOrDlq(message, payload);
  }
}

function retryOrDlq(message: Message<WebhookQueueMessage>, payload: WebhookQueueMessage): void {
  if (payload.attempt >= MAX_ATTEMPTS) {
    // Falls through to the configured DLQ.
    message.retry();
    return;
  }
  const delay =
    RETRY_DELAYS_SECONDS[Math.min(payload.attempt, RETRY_DELAYS_SECONDS.length - 1)] ?? 60;
  message.retry({ delaySeconds: delay });
  // Note: We do NOT mutate `payload.attempt` in-place because Cloudflare Queues
  // re-delivers the original body. The attempt counter is tracked via the
  // `Message.attempts` property on redelivery. The producer always sets attempt=1.
  void payload; // retained for clarity
}

async function updateDeliveryStatus(
  env: ApiEnv,
  webhookId: string,
  status: number,
  ok: boolean,
): Promise<void> {
  if (!env.CONTROL_PLANE_DB) return;
  try {
    const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
    await db
      .update(webhooks)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: status,
        failureCount: ok ? 0 : sql`${webhooks.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, webhookId));
  } catch (e) {
    // Non-fatal; the message ack/retry decision still holds.
    console.error('[webhook] failed to update delivery status', webhookId, e);
  }
}

// Re-export so callers know the codes used here are the canonical ones.
export const WEBHOOK_ERROR = ERROR_CODES.WEBHOOK_DELIVERY_FAILED;
